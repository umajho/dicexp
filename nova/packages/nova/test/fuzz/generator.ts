/**
 * Seeded random-program generator for the naive∩nova differential fuzzer
 * (`../fuzz.test.ts`).
 *
 * Strategy: build a typed AST over the *compatible subset* of dicexp, then
 * render it to source with varied spacing / parenthesization / pipe forms.
 * Every *documented* divergence (nova/docs/compat.md) is avoided by
 * construction; each avoidance rule cites its compat.md entry:
 *
 * - #1  (`and`/`or`/`any?` short-circuit): `and`, `or`, `any?` are never
 *       generated, not even as captures (`&and/2` …).
 * - #2  (64-bit `//`/`%`): operands of `//` and `%` are generated under a
 *       conservative static range cap of ±(2^31−1) — inside int32, naive's
 *       `| 0` truncation equals nova's i64 truncating division/modulo
 *       (verified for all sign combinations, including the int32 extremes).
 * - #3  (unknown identifiers/functions eager in nova): only the known
 *       builtin set below, always at exact arity; closure parameters are
 *       always bound (no free variables), freshly named per program
 *       (`$a`, `$b`, …; `_` for an unused parameter; `$x` is reserved for
 *       reroll/explode predicates and never handed out by the name pool).
 * - #9  (i128 vs f64 accumulation): `sum`/`product` are only emitted where
 *       the conservative total (max|elem|·len, resp. max|elem|^len) stays
 *       within ±(2^53−1) — partial accumulations included. The element and
 *       length bounds are sound (see the beacon bullet below), so no
 *       normal-path arithmetic can overflow: per-op `*`/`**` overflow and
 *       its identical `limitationExceeded` error are exercised only
 *       deliberately (the sketchy applyErr template; pinned rows in
 *       test/differential.test.ts).
 * - #9  (map/zipWith poison the list's error beacon): naive's map/zipWith
 *       break-check materializes each element's error state into the list's
 *       error beacon, so even a consumer that never forces the elements
 *       (e.g. `count` with a predicate that ignores its parameter) errors in
 *       naive, where nova's uniform laziness returns ok (the poison also
 *       propagates through non-forcing wrappers such as tail/append/zip,
 *       and through an outer map even when its body is total). Normal-path
 *       map/zipWith closure applications are therefore provably
 *       error-free: apply args are constrained to the closure's param
 *       ranges (previously generated under ANY — an out-of-range arg could
 *       violate every range-based guarantee at runtime, found live as a
 *       `%` divisor of −431) and sum/product extremes cover every length in
 *       [lenLo, lenHi] (the empty list included) — so no normal-path
 *       expression can error at runtime and the beacon can never be
 *       poisoned. The divergence itself is exercised deliberately instead
 *       (BEACON_DIVERGENT below, asserted per-side by the fuzz suite;
 *       pinned shapes in test/differential.test.ts).
 * - #9  (naive crash: bad reroll/explode closures): reroll/explode closures
 *       are pure boolean predicates over the parameter (`$x <= k`, `$x ==
 *       k`, `not (…)`, `false`) — no erroring or non-boolean bodies, no
 *       dice inside. Reroll needs per-pull stop-probability > 0; explode
 *       additionally ≤ 1/2 (bounding chains). A `true` predicate is
 *       excluded: on any infinite-capable source it never settles the
 *       debt / never emits `last` — both implementations hang. Sources
 *       are dice literals or `N#body` with N ≤ 5, M ≤ 12; `a~b` is a
 *       uniform die draw per pull (nominal length 1, infinite past
 *       nominal — reroll/explode legitimately pull past nominal).
 * - #9  (negative `NdM` count crashes naive): dice counts are always ≥ 0
 *       (`d/2` with n = 0 → 0 is preserved behavior; appears rarely).
 * - #9  (leaky trailing slots after a `map`/`zipWith` element error): the
 *       sketchy fraction never places an erroring element inside a
 *       `map`/`zipWith` input list (it uses `sum`/`sort`/plain lists).
 * - #10 (comparison captures rejected by naive's parser): captures are
 *       restricted to arithmetic/dice/`not` operators — the `+`, `-`, `*`,
 *       `**`, `^`, `%`, `~` binary captures, the `d/1`/`d/2` captures, and
 *       the unary `&-/1`/`&not/1`. `&//2` is also excluded: both parsers
 *       reject it but with different ⚠ spans (empirical scratch-probe
 *       finding).
 * -     `d%` is rejected by both parsers — never emitted.
 * -     Integer literals stay within ±(2^31−1); `**` exponents are literal
 *       0..6 (negative exponents only in the sketchy fraction).
 * -     A JS `-0` can leak from naive (e.g. `(-1) * 0`, `-(0)`) where nova
 *       produces i64 `0`: the `*` operator and its capture never combine an
 *       exact-zero operand with a possibly-negative one; `neg`/`&-/1` never wrap a range
 *       containing 0; `product` never mixes a 0-spanning element range
 *       with other elements. (The comparator also normalizes via JSON, so
 *       `-0` ≡ `0` — belt and braces.)
 * -     Closures never flow into final results; lists stay homogeneous
 *       int/bool/nested-int-list (nesting ≤ 2; lengths ≤ 6 literally,
 *       ≤ 14 via concat, ≤ ~42 via flatMap — range/length claims stay
 *       sound; `#` counts ≤ 8) — the top-level comparator deep-evaluates
 *       plain values only.
 * -     v0.7 builtins (nova/docs/v0.7-contracts.md — new in BOTH impls,
 *       so contract-identical; each rule cites the contract/compat entry
 *       it guards):
 * -     `all?/1` is never generated, like `any?` (compat #1): nova
 *       short-circuits element forcing at the first `false`, naive
 *       flattens eagerly — any die, non-boolean, or error past the first
 *       `false` diverges (value or RNG order). Restricting elements to
 *       provably dice-free booleans is not expressible with the
 *       generator's tracking (dice-freeness is not a tracked property),
 *       so it is excluded outright; the sensitive rows are pinned by the
 *       differential suite's deliberate dice rows instead.
 * -     `unfold/2` is never generated: a meaningful TERMINATING step
 *       closure needs an `if` (absent this iteration; the sim-idiom
 *       `head(append(filter([[t]], |_| cond), false))` is not
 *       template-able) — `iterate/2` + bounded `take` covers the
 *       sequence-producer story (judgment call, see `takeSeq` below).
 * -     `sort/2` uses a pure, CONSISTENT comparator (`|$a, $b| $a <= $b`
 *       and friends — comparison count/order differs between impls, so
 *       effectful comparators are unspecified; contract "sort/2
 *       comparator") over a LITERAL scalar list: element handles are
 *       forced by the comparator in comparison order, so dice-carrying
 *       elements with differing per-element draw counts (e.g. `[2d6,
 *       d6]`) could consume the stream in different orders per impl and
 *       permute the drawn multiset — literals sidestep the stream.
 * -     `foldl/3`/`foldr/3` bodies are dice-free (template-built from
 *       closure params + literals only; the contract's checklist routes
 *       diceful fold rows to the differential suite). Elements/init may
 *       carry dice for BOTH folds: foldl is strict (identical forcing
 *       order in both impls — verified in isolation and by the fuzz
 *       runs); foldr's deferred calls execute outer-in in both impls —
 *       a fuzz finding here (`foldr([d2, d100], d1000, |$e, $a| $e -
 *       $a)`: naive forced bodies right-to-left at chain-construction
 *       time via its closure `_call`'s eager `.get()`) was a REAL naive
 *       bug, fixed in v0.7 (naive's foldr lazy-wraps the calls; the
 *       contract pins outer-in). Inputs stay shallow by construction
 *       (foldr's nested lazy calls overflow both impls only at ≳10³
 *       elements — compat #6).
 * -     `iterate/2` sequences appear ONLY as `take([drop](iterate(start,
 *       f), j), k)` with small j + k: the bare sequence is infinite, and
 *       casting it to a list (top level, `sum`, list-arg positions…) is
 *       unbounded — nova's memory-limit error vs naive's hang is an
 *       intended asymmetry that must not be fuzzed (contract "casting an
 *       infinite sequence"). The next-function is pure (param + one
 *       literal op). `take`/`drop` over dice/repetition sources pull in
 *       the same order in both impls; `take` legitimately pulls PAST the
 *       nominal end (`take(d6, 3)` = 3 rolls, `take(3#d6, 5)` = 5 —
 *       contract "take/2"), so counts stay small (k ≤ 5, j ≤ 3).
 * -     `take`/`drop` over LIST-typed inputs never receive a SEQUENCE
 *       source (raw `N#body` repetitions and reroll/explode transformer
 *       results — `isSequenceNode`): their list cast is nominal-bounded
 *       (how `sum(3#d6)` always worked), but `take` pulls past nominal
 *       (exactly k items — a min(k, len) claim would be unsound) and
 *       `drop`'s lazy skip can pass the nominal-last marker
 *       (`drop(5#d6, 7)`, `drop(explode(3#d9, …), 6)`), making the
 *       result's list cast UNBOUNDED — the must-not-fuzz shape (both
 *       found live as nova 内存不足 / a naive heap OOM). Sequence takes
 *       go through `takeSeq` only.
 * -     `takeWhile/2`/`dropWhile/2` predicates are pure templates over
 *       the element type (contract: per-element calls in list order;
 *       error-free elements are the normal path's invariant anyway).
 * -     `has?/2` scans flat int/bool lists with a scalar needle (a
 *       list/pair element would be a key-50 error — off the normal path);
 *       cross-type needles are simply unequal (contract). Both impls
 *       short-circuit at the first match identically (new in both), so
 *       dice in elements/needle are safe.
 * -     `min/1`/`max/1`/`last/1`/`init/1` take lenLo ≥ 1 lists only:
 *       the `[]` case errors with 列表为空 (key 44), which would break
 *       the normal path's error-freedom (and could poison naive's
 *       map/zipWith error beacon from inside a closure body — compat #9);
 *       the error shape is covered deliberately by the `emptyV07` sketchy
 *       template instead.
 * -     `duplicate/2` pins its value — ONE evaluation, so `duplicate(d6,
 *       3)` consumes one draw in both impls (contract); counts ≤ 4, and
 *       the element range claim is the pinned value's range (a duplicated
 *       die contributes its single value × count to sums — sound).
 * -     `flatten/2`/`flattenAll/1` inputs stay in the nesting lattice
 *       (outer ≤ 4, inner ≤ 3 / repetition ≤ 3, depth 0..2);
 *       repetition elements exercise the sequence→list splice of the
 *       listness test (contract "flatten") with sound element ranges —
 *       pulling happens left-to-right in both impls.
 * -     `<`/`>`/`<=`/`>=` over booleans (`false < true`) use
 *       homogeneous boolean operands: mixed int/bool operands error with
 *       key 42 in both impls (contract operators) but stay off the
 *       normal error-free path; comparison captures remain excluded
 *       (compat #10).
 * -     New integer producers feed the range tracking conservatively
 *       (soundness over precision): `abs` → [0, max|x|], `count/1` →
 *       [lenLo, lenHi], `min`/`max` → the element range, `at/3` →
 *       element ∪ default by index certainty (negative indices are
 *       always OOB), folds → the union over step counts 0..lenHi (fold
 *       op ranges are NOT monotone — ×c alternates/collapses), iterate →
 *       the union of the taken window r_j..r_{j+k−1} (`* 0` collapses).
 * -     `append`/`prepend`/`concat` now WIDEN the claimed element range
 *       with the appended/prepended/concatenated elements' ranges
 *       (`append` previously dropped the appended element's range — an
 *       unsound claim that could, in principle, let a claimed-nonzero
 *       element be 0 and error inside a map/zipWith body).
 *
 * Rendering mirrors the grammar's binding powers (nova's parser `bp` table
 * and `internal/lezer/src/precedence-table.ts` — same relative order; the
 * tricky combinations were verified empirically against both parsers):
 * left operands parenthesize iff child bp < parent bp, right operands iff
 * child bp ≤ parent bp; prefix operands parse at their bp level (`not`/`-`
 * at 13, `~M` at 8 — `~M` renders bare only in delimited positions); a
 * closure callee of a value call is always wrapped; closure bodies render
 * nested-only (they are `expressionWithoutPipe`, so no top-level `|>` — and
 * no trailing-closure calls either, which would nest ambiguously). Call
 * chains render either fully nested or as a top-level pipe chain (arg1
 * threaded through the left spine — every spine call including the
 * OUTERMOST one renders as a step; an old off-by-one silently dropped
 * the outermost call, see renderProgram); trailing-closure call forms
 * (`f(a) |$x| body`) are only emitted where EOF or an argument delimiter
 * follows — never as a pipe-chain step (`x |> f() |$x| …` is unverified).
 */

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

/** mulberry32 — small, well-known, fully deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform integer in [lo, hi] (inclusive). */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)] as T;
  }

  /** Weighted pick over (item, weight) pairs (weights need not sum to 1). */
  weighted<T>(pairs: [T, number][]): T {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let t = this.next() * total;
    for (const [x, w] of pairs) {
      t -= w;
      if (t < 0) return x;
    }
    return pairs[pairs.length - 1]![0];
  }
}

// ---------------------------------------------------------------------------
// Conservative integer ranges
// ---------------------------------------------------------------------------

const MAX_I32 = 2 ** 31 - 1; // compat #2 — `//`/`%` operand cap
const MAX_I53 = 2 ** 53 - 1; // compat #9 — accumulation cap

/** Conservative bounds; every actual value lies in [lo, hi].
 * `interval`: the value set is (a.s.) the full integer interval with
 * reachable extremes — required for `==`/`!=` predicate reasoning. */
export interface IntRange {
  lo: number;
  hi: number;
  interval: boolean;
}

/** `null` = unbounded (overflow-capable via `*`/`**`; may still evaluate
 * fine, or error identically in both impls — just not provably bounded). */
export type Range = IntRange | null;

function ir(lo: number, hi: number, interval: boolean): IntRange {
  return { lo, hi, interval };
}

function bounded(lo: number, hi: number): boolean {
  return lo >= -MAX_I53 && hi <= MAX_I53;
}

function rAdd(a: IntRange, b: IntRange): Range {
  const lo = a.lo + b.lo;
  const hi = a.hi + b.hi;
  return bounded(lo, hi) ? ir(lo, hi, a.interval && b.interval) : null;
}

function rSub(a: IntRange, b: IntRange): Range {
  const lo = a.lo - b.hi;
  const hi = a.hi - b.lo;
  return bounded(lo, hi) ? ir(lo, hi, a.interval && b.interval) : null;
}

function rMul(a: IntRange, b: IntRange): Range {
  const cs = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi];
  const lo = Math.min(...cs);
  const hi = Math.max(...cs);
  if (!bounded(lo, hi)) return null;
  // A single-point factor keeps interval-ness; general products have gaps.
  const interval = (a.lo === a.hi || b.lo === b.hi) && a.interval && b.interval;
  return ir(lo, hi, interval);
}

function rPow(base: IntRange, k: number): Range {
  if (k === 0) return ir(1, 1, true);
  if (k % 2 === 1) {
    const lo = base.lo ** k;
    const hi = base.hi ** k;
    return bounded(lo, hi) ? ir(lo, hi, base.lo === base.hi) : null;
  }
  // Even exponent: extreme at max |x|; 0 inside the range gives minimum 0.
  const maxAbs = Math.max(Math.abs(base.lo), Math.abs(base.hi));
  const minAbs = base.lo <= 0 && base.hi >= 0
    ? 0
    : Math.min(Math.abs(base.lo), Math.abs(base.hi));
  const lo = minAbs ** k;
  const hi = maxAbs ** k;
  return bounded(lo, hi) ? ir(lo, hi, base.lo === base.hi) : null;
}

function rNeg(a: IntRange): Range {
  return ir(-a.hi, -a.lo, a.interval);
}

/** |x| over a range: abs of a full integer interval is a full interval. */
function rAbs(a: IntRange): IntRange {
  const lo = a.lo > 0 ? a.lo : a.hi < 0 ? -a.hi : 0;
  const hi = Math.max(Math.abs(a.lo), Math.abs(a.hi));
  return ir(lo, hi, a.interval);
}

function trunc(x: number): number {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
}

/** Truncating-division bounds; `d` must exclude 0 (sign-consistent). */
function rIdiv(a: IntRange, d: IntRange): Range {
  const cs = [
    trunc(a.lo / d.hi),
    trunc(a.lo / d.lo),
    trunc(a.hi / d.hi),
    trunc(a.hi / d.lo),
  ];
  const lo = Math.min(...cs);
  const hi = Math.max(...cs);
  return bounded(lo, hi) ? ir(lo, hi, false) : null;
}

/** Modulo bounds: dividend ⊆ [0, …], divisor ⊆ [1, …]. */
function rMod(a: IntRange, d: IntRange): Range {
  return ir(0, Math.min(a.hi, d.hi - 1), false);
}

/** Union of ranges (for list-literal element bounds). Empty → null
 * (an empty union would otherwise produce [∞, −∞], which `bounded`
 * mishandles — found live as a rendered `NaN` literal). */
function rUnion(rs: Range[]): Range {
  if (rs.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  let interval = true;
  for (const r of rs) {
    if (!r) return null;
    lo = Math.min(lo, r.lo);
    hi = Math.max(hi, r.hi);
    interval = interval && r.interval;
  }
  return bounded(lo, hi) ? ir(lo, hi, interval) : null;
}

// ---------------------------------------------------------------------------
// Weighted value distributions
// ---------------------------------------------------------------------------

/**
 * Transformer-predicate analysis needs true probabilities, not counts:
 * a `NdM` body value is a dice SUM (bell-shaped), so "k of width values
 * satisfy" says nothing about per-pull probability — e.g. `$x != 60` over
 * `5d12` stops only on the top sum (probability 12⁻⁵ ≈ 4e-6), rerolling
 * ~2.4M times despite 55/56 values "failing" the predicate. Distributions
 * are tracked as integer weights (proportional to probability; dice-sum
 * weights stay far below 2^53).
 */
interface Dist {
  lo: number;
  hi: number;
  /** weights[i] = weight of value lo + i (0 = impossible value). */
  weights: number[];
}

function uniformDist(lo: number, hi: number): Dist {
  return { lo, hi, weights: new Array(hi - lo + 1).fill(1) };
}

function singleDist(v: number): Dist {
  return { lo: v, hi: v, weights: [1] };
}

/** Distribution of the sum of n independent uniform draws in [1, m]. */
function dieSumDist(n: number, m: number): Dist {
  let d = uniformDist(1, m);
  for (let i = 1; i < n; i++) {
    d = convolveAdd(d, uniformDist(1, m));
  }
  return d;
}

function convolveAdd(a: Dist, b: Dist): Dist {
  const lo = a.lo + b.lo;
  const hi = a.hi + b.hi;
  const weights = new Array(hi - lo + 1).fill(0);
  for (let i = 0; i < a.weights.length; i++) {
    const wa = a.weights[i]!;
    if (wa === 0) continue;
    for (let j = 0; j < b.weights.length; j++) {
      const wb = b.weights[j]!;
      if (wb === 0) continue;
      weights[i + j]! += wa * wb;
    }
  }
  return { lo, hi, weights };
}

function convolveSub(a: Dist, b: Dist): Dist {
  const lo = a.lo - b.hi;
  const hi = a.hi - b.lo;
  const weights = new Array(hi - lo + 1).fill(0);
  for (let i = 0; i < a.weights.length; i++) {
    const wa = a.weights[i]!;
    if (wa === 0) continue;
    for (let j = 0; j < b.weights.length; j++) {
      const wb = b.weights[j]!;
      if (wb === 0) continue;
      // Index by the value OFFSET FROM lo (as convolveAdd does with i+j):
      // the raw value made out-of-range writes whenever lo ≠ 0, which
      // extended the array with null and made distTotal NaN — NaN then
      // silently bypassed genPredicate's termination checks (every NaN
      // comparison is false) and emitted a never-settling reroll predicate,
      // i.e. the excluded both-impls-hang shape (found live as a hard V8
      // heap OOM in naive's reroll; see the compat #9 reroll carve-out).
      weights[(a.lo + i) - (b.lo + j) - lo]! += wa * wb;
    }
  }
  return { lo, hi, weights };
}

function distTotal(d: Dist): number {
  let t = 0;
  for (const w of d.weights) t += w;
  return t;
}

/** Restrict to the kept values (weights preserved — ratios are what the
 * next layer's checks need; conditioning only rescales uniformly). */
function filterDist(d: Dist, keep: (v: number) => boolean): Dist {
  const lo = d.lo;
  const hi = d.hi;
  const weights = d.weights.map((w, i) => (keep(lo + i) ? w : 0));
  return { lo, hi, weights };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Ty =
  | { k: "int"; r: Range }
  | { k: "bool" }
  | { k: "list"; elem: Ty; lenLo: number; lenHi: number }
  | { k: "pair"; a: Ty; b: Ty }; // zip elements

const intTy = (r: Range): Ty => ({ k: "int", r });
const boolTy: Ty = { k: "bool" };

/** Bound constraint for generated integer expressions. */
interface C {
  minLo: number;
  maxHi: number;
}

const ANY: C = { minLo: -Infinity, maxHi: Infinity };

function fits(r: Range, c: C): boolean {
  return r !== null && r.lo >= c.minLo && r.hi <= c.maxHi;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type BinOp = "+" | "-" | "*" | "**" | "//" | "%" | "~";
export type CmpOp = "<" | ">" | "<=" | ">=" | "==" | "!=";

export type Node =
  | { kind: "int"; v: number }
  | { kind: "bool"; v: boolean }
  | { kind: "var"; name: string }
  | { kind: "neg"; x: Node }
  | { kind: "not"; x: Node }
  | { kind: "bin"; op: BinOp; l: Node; r: Node }
  | { kind: "cmp"; op: CmpOp; l: Node; r: Node }
  | { kind: "die1"; m: number }
  | { kind: "die2"; n: number; m: number }
  | { kind: "range"; a: number; b: number }
  | { kind: "urange"; m: number }
  | { kind: "repeat"; count: number; body: Node }
  | { kind: "listLit"; xs: Node[] }
  // `trail` marks the call as eligible for the trailing-closure rendering
  // (last arg is a closure); the renderer decides per site.
  | { kind: "call"; name: string; args: Node[]; trail?: true }
  | { kind: "valueCall"; callee: Node; args: Node[] }
  | { kind: "capture"; fn: string; arity: number }
  | { kind: "closure"; params: string[]; body: Node };

/** Binding-power classes — the grammar's relative precedence order
 * (nova's parser `bp` table / `precedence-table.ts`; higher = tighter). */
const BP = {
  ATOM: 100, // literals, vars, lists, closures (as args), captures, `name(…)`
  DICE: 15, // `NdM`
  CALL: 14, // value call `callee.(…)`
  PREFIX: 13, // prefix `not` / unary `-` (operands parse at 13)
  EXP: 12, // `**`
  TIMES: 11, // `*` `//` `%`
  PLUS: 9, // `+` `-`
  URANGE: 8, // prefix `~M` (operand parses at 8)
  RANGE: 7, // `a~b`
  REPEAT: 6, // `#`
  PIPE: 5, // `|>`
  COMPARE: 4, // `<` `>` `<=` `>=`
  EQUAL: 3, // `==` `!=`
} as const;

function bpOfBin(op: BinOp): number {
  switch (op) {
    case "**":
      return BP.EXP;
    case "*":
    case "//":
    case "%":
      return BP.TIMES;
    case "+":
    case "-":
      return BP.PLUS;
    case "~":
      return BP.RANGE;
  }
}

function nodeBp(node: Node): number {
  switch (node.kind) {
    case "int":
    case "bool":
    case "var":
    case "listLit":
    case "closure":
    case "capture":
    case "call":
      return BP.ATOM;
    case "die1":
    case "die2":
      return BP.DICE;
    case "range":
      return BP.RANGE;
    case "urange":
      return BP.URANGE;
    case "neg":
    case "not":
      return BP.PREFIX;
    case "bin":
      return bpOfBin(node.op);
    case "cmp":
      return node.op === "==" || node.op === "!=" ? BP.EQUAL : BP.COMPARE;
    case "repeat":
      return BP.REPEAT;
    case "valueCall":
      return BP.CALL;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const intLitRange = (v: number): IntRange => ir(v, v, true);

function negateCmp(
  op: "<" | "<=" | ">" | ">=" | "==" | "!=",
): "<" | "<=" | ">" | ">=" | "==" | "!=" {
  switch (op) {
    case "<=":
      return ">";
    case "<":
      return ">=";
    case ">=":
      return "<";
    case ">":
      return "<=";
    case "==":
      return "!=";
    case "!=":
      return "==";
  }
}

/** Nodes whose runtime value is a SEQUENCE (not a real list): raw
 * repetitions and reroll/explode transformer results. Their list CAST is
 * nominal-bounded (how `sum(3#d6)` always worked), but `take` pulls past
 * nominal and `drop`'s lazy skip can pass the nominal-last marker — so
 * they must not reach take/drop as their first argument. */
function isSequenceNode(node: Node): boolean {
  return node.kind === "repeat" ||
    (node.kind === "call" && (node.name === "reroll" || node.name === "explode"));
}

function collectVars(node: Node): Set<string> {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    switch (n.kind) {
      case "var":
        out.add(n.name);
        return;
      case "neg":
      case "not":
        walk(n.x);
        return;
      case "bin":
      case "cmp":
        walk(n.l);
        walk(n.r);
        return;
      case "repeat":
        walk(n.body);
        return;
      case "listLit":
        for (const x of n.xs) walk(x);
        return;
      case "call":
        for (const a of n.args) walk(a);
        return;
      case "valueCall":
        walk(n.callee);
        for (const a of n.args) walk(a);
        return;
      case "closure":
        walk(n.body);
        return;
      default:
        return;
    }
  };
  walk(node);
  return out;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

// `$x` is reserved for reroll/explode predicates (compat #9 carve-out —
// they are always `|$x| …`), so the per-program pool hands out the rest.
const NAME_POOL = "abcdefghijklmnopqrstuvwyz".split("").map((c) => `$${c}`);

/** Result of generating one program. */
export interface GeneratedProgram {
  index: number;
  source: string;
  sketchy: boolean;
}

interface Env {
  vars: { name: string; ty: Ty }[];
}

const EMPTY_ENV: Env = { vars: [] };

const SKETCHY_P = 0.03; // ~3% deliberate runtime-error programs
const TOP_DEPTH = 5;

/** Clamped descent — closure bodies at depth 0 would otherwise
 * recurse to negative depths where the atom branches never fire. */
function dec(depth: number): number {
  return Math.max(0, depth - 1);
}

interface IntGen {
  node: Node;
  r: Range;
}

interface ListGen {
  node: Node;
  ty: Ty;
}

/** `~` range draws (interval sources for transformers). */
function drawRange(rng: Rng): IntRange {
  const a = rng.int(1, 5);
  const b = rng.int(a, 12);
  return ir(a, b, true);
}

export class ProgramGenerator {
  readonly rng: Rng;
  private names: string[] = [];
  private fallbackCount = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** Pool names first; once exhausted, a per-program counter (`$v0`, …) —
   * COLLISION-FREE, unlike the old random `$v{0..99}` fallback, which
   * could hand the same name to two params of one closure (`|$v48, $v48|`
   * — rejected eagerly by nova, accepted by naive; compat #3; found live
   * at FUZZ_SEED=7 #2518 once the v0.7 cases started exhausting the pool). */
  private freshName(): string {
    const n = this.names.shift();
    if (n !== undefined) return n;
    return `$v${this.fallbackCount++}`;
  }

  genProgram(): { node: Node; sketchy: boolean } {
    this.names = [...NAME_POOL];
    this.fallbackCount = 0;
    if (this.rng.chance(SKETCHY_P)) {
      return { node: this.genSketchy(), sketchy: true };
    }
    const roll = this.rng.float();
    if (roll < 0.5) {
      return { node: this.genInt(TOP_DEPTH, EMPTY_ENV, ANY).node, sketchy: false };
    }
    if (roll < 0.78) {
      return { node: this.genList(TOP_DEPTH, EMPTY_ENV).node, sketchy: false };
    }
    return { node: this.genBool(TOP_DEPTH, EMPTY_ENV).node, sketchy: false };
  }

  // ---- integer expressions ------------------------------------------------

  /** Literal magnitude distribution (non-negative; negatives via `neg`;
   * the sketchy out-of-bound index is the only bare negative literal). */
  private litInt(c: C): { kind: "int"; v: number } {
    for (let attempt = 0; attempt < 8; attempt++) {
      const bucket = this.rng.weighted<[number, number]>([
        [[0, 0], 8],
        [[1, 20], 52],
        [[21, 100], 22],
        [[101, 1000], 10],
        [[1001, 1000000], 6],
        [[1000001, MAX_I32], 2],
      ]);
      const lo = Math.max(bucket[0], Math.max(0, Math.ceil(c.minLo)));
      const hi = Math.min(bucket[1], Math.floor(c.maxHi));
      if (lo <= hi) return { kind: "int", v: this.rng.int(lo, hi) };
    }
    // Constraint narrower than every bucket.
    const lo = Math.max(0, Math.ceil(c.minLo));
    const hi = Math.floor(c.maxHi);
    return { kind: "int", v: lo <= hi ? this.rng.int(lo, hi) : lo };
  }

  private dieSides(): number {
    return this.rng.weighted([
      [this.rng.int(2, 6), 55],
      [this.rng.int(7, 12), 38],
      [20, 5],
      [100, 2],
    ]);
  }

  private dieCount(): number {
    // compat #9 — negative counts crash naive; 0 is fine (→ 0, no RNG).
    return this.rng.weighted([
      [this.rng.int(1, 5), 70],
      [this.rng.int(6, 8), 25],
      [0, 5],
    ]);
  }

  private genInt(depth: number, env: Env, c: C): IntGen {
    const table: [string, number][] = [
      ["lit", 26],
      ["die1", 4],
      ["die2", 8],
      ["range", 5],
      ["urange", 2.5],
      ["neg", 3],
      ["+", 9],
      ["-", 5],
      ["*", 5.5],
      ["**", 3],
      ["//", 4],
      ["%", 4],
      ["sum", 4.5],
      ["product", 2],
      ["count", 3],
      ["at", 3.5],
      ["head", 2],
      ["cap", 3.5],
      ["apply", 2.5],
      ["reroll", 2],
      ["explode", 1],
      // v0.7 builtins (nova/docs/v0.7-contracts.md)
      ["abs", 3],
      ["count1", 2.5],
      ["min", 2],
      ["max", 2],
      ["at3", 3],
      ["last", 1.5],
      ["foldl", 2],
      ["foldr", 2],
    ];
    if (env.vars.some((v) => v.ty.k === "int")) table.push(["var", 7]);
    if (depth <= 0) {
      const atomTable: [string, number][] = [
        ["lit", 55],
        ["die1", 8],
        ["die2", 16],
        ["range", 12],
        ["urange", 6],
      ];
      if (env.vars.some((v) => v.ty.k === "int")) atomTable.push(["var", 10]);
      for (let attempt = 0; attempt < 8; attempt++) {
        const g = this.atomInt(this.rng.weighted(atomTable), env, c);
        if (g) return g;
      }
    } else {
      for (let attempt = 0; attempt < 10; attempt++) {
        const g = this.buildInt(this.rng.weighted(table), depth, env, c);
        if (g) return g;
      }
    }
    // Guaranteed fallback: a fitting literal.
    const node = this.litInt(c);
    return { node, r: intLitRange(node.v) };
  }

  /** Atoms; `null` = constraint not satisfied (retry). */
  private atomInt(kind: string, env: Env, c: C): IntGen | null {
    const finish = (node: Node, r: IntRange): IntGen | null =>
      fits(r, c) ? { node, r } : null;
    switch (kind) {
      case "lit": {
        const node = this.litInt(c);
        return { node, r: intLitRange(node.v) };
      }
      case "die1": {
        const m = this.dieSides();
        return finish({ kind: "die1", m }, ir(1, m, true));
      }
      case "die2": {
        const n = this.dieCount();
        const m = this.dieSides();
        return finish({ kind: "die2", n, m }, ir(n, n * m, true));
      }
      case "range": {
        const r = drawRange(this.rng);
        return finish({ kind: "range", a: r.lo, b: r.hi }, r);
      }
      case "urange": {
        const m = this.rng.int(1, 12);
        return finish({ kind: "urange", m }, ir(1, m, true));
      }
      case "var": {
        const vs = env.vars.filter(
          (v): v is { name: string; ty: { k: "int"; r: IntRange } } =>
            v.ty.k === "int" && v.ty.r !== null,
        );
        if (!vs.length) return null;
        const v = this.rng.pick(vs);
        return finish({ kind: "var", name: v.name }, v.ty.r);
      }
      default:
        return null;
    }
  }

  private buildInt(kind: string, depth: number, env: Env, c: C): IntGen | null {
    const finish = (node: Node, r: Range): IntGen | null =>
      fits(r, c) ? { node, r } : null;
    const sub = (cc: C = c): IntGen => this.genInt(dec(depth), env, cc);
    switch (kind) {
      case "lit":
      case "die1":
      case "die2":
      case "range":
      case "urange":
      case "var":
        return this.atomInt(kind, env, c);

      case "neg": {
        // Unary minus; avoid `-0` (compat note): skip ranges containing 0.
        const g = sub({ minLo: -c.maxHi, maxHi: -c.minLo });
        if (!g.r || (g.r.lo <= 0 && g.r.hi >= 0)) return null;
        return finish({ kind: "neg", x: g.node }, rNeg(g.r));
      }

      case "+": {
        const a = sub();
        const b = sub();
        if (!a.r || !b.r) return null;
        return finish({ kind: "bin", op: "+", l: a.node, r: b.node }, rAdd(a.r, b.r));
      }
      case "-": {
        const a = sub();
        const b = sub();
        if (!a.r || !b.r) return null;
        return finish({ kind: "bin", op: "-", l: a.node, r: b.node }, rSub(a.r, b.r));
      }
      case "*": {
        const a = sub();
        const b = sub();
        if (!a.r || !b.r) return null;
        // Avoid `-0`: an exact-zero factor with a possibly-negative one.
        const zeroA = a.r.lo === 0 && a.r.hi === 0;
        const zeroB = b.r.lo === 0 && b.r.hi === 0;
        if ((zeroA && b.r.lo < 0) || (zeroB && a.r.lo < 0)) return null;
        return finish({ kind: "bin", op: "*", l: a.node, r: b.node }, rMul(a.r, b.r));
      }
      case "**": {
        if (depth < 2) return null;
        const k = this.rng.int(0, 6);
        const base = this.genInt(dec(depth), env, ANY);
        if (!base.r) return null;
        return finish(
          { kind: "bin", op: "**", l: base.node, r: { kind: "int", v: k } },
          rPow(base.r, k),
        );
      }
      case "//": {
        // compat #2 — operands provably within ±(2^31−1); divisor never 0
        // in normal programs (`X // 0` is the sketchy divZero shape).
        const a = this.genInt(dec(depth), env, { minLo: -MAX_I32, maxHi: MAX_I32 });
        const dc: C = this.rng.chance(0.85)
          ? { minLo: 1, maxHi: MAX_I32 }
          : { minLo: -MAX_I32, maxHi: -1 };
        const d = this.genInt(dec(depth), env, dc);
        if (!a.r || !d.r) return null;
        return finish({ kind: "bin", op: "//", l: a.node, r: d.node }, rIdiv(a.r, d.r));
      }
      case "%": {
        // compat #2 — bounds; naive errors on negative dividends (kept for
        // the sketchy fraction) and requires a positive divisor.
        const a = this.genInt(dec(depth), env, { minLo: 0, maxHi: MAX_I32 });
        const d = this.genInt(dec(depth), env, { minLo: 1, maxHi: MAX_I32 });
        if (!a.r || !d.r) return null;
        return finish({ kind: "bin", op: "%", l: a.node, r: d.node }, rMod(a.r, d.r));
      }

      case "sum":
      case "product": {
        const list = this.genList(dec(depth), env);
        const lt = list.ty;
        if (lt.k !== "list" || lt.elem.k !== "int" || !lt.elem.r) return null;
        const er = lt.elem.r;
        const maxAbs = Math.max(Math.abs(er.lo), Math.abs(er.hi));
        // compat #9 — i128 vs f64 accumulation: keep the conservative
        // total (hence every partial) within ±(2^53−1).
        const total = kind === "sum" ? maxAbs * lt.lenHi : maxAbs ** lt.lenHi;
        if (total > MAX_I53) return null;
        // compat #9 (map/zipWith error beacon): the claimed range must
        // cover EVERY length in [lenLo, lenHi] — an unsound claim could
        // pass a constraint that an actual value violates (e.g. a `//`
        // divisor ≥ 1 where a sum over an empty filter list is 0),
        // erroring at runtime and poisoning naive's error beacon from
        // inside a map/zipWith closure body.
        if (kind === "product") {
          // `-0` avoidance: skip 0-spanning element ranges.
          if (er.lo <= 0 && er.hi >= 0 && lt.lenHi > 1) return null;
          let cs: number[];
          if (er.lo >= 0) {
            // Non-negative elements: products are monotone in the count,
            // so the extremes sit at lenLo/lenHi (plus the empty product 1
            // when lenLo = 0; 0-spanning ranges reach here only with
            // lenHi ≤ 1, where the elements themselves bound the k = 1
            // case).
            const ks = lt.lenLo === 0 ? [0, lt.lenHi] : [lt.lenLo, lt.lenHi];
            cs = ks.flatMap((k) => (k === 0 ? [1] : [er.lo ** k, er.hi ** k]));
          } else if (lt.lenLo === lt.lenHi) {
            // Negative elements, fixed count: the k-th powers of the
            // endpoints bound the product (sign fixed by the parity of k).
            const k = lt.lenHi;
            cs = k === 0 ? [1] : [er.lo ** k, er.hi ** k];
          } else {
            // Negative elements, uncertain count: the product's SIGN is
            // uncertain (count parity), so only the symmetric hull
            // ±maxAbs^lenHi is sound (maxAbs ≥ 1, so it also covers the
            // empty product 1).
            const m = maxAbs ** lt.lenHi;
            cs = [-m, m];
          }
          return finish(
            { kind: "call", name: "product", args: [list.node] },
            ir(Math.min(...cs), Math.max(...cs), false),
          );
        }
        // Sum: partial sums of k elements lie in [er.lo·k, er.hi·k]; the
        // extremes sit at lenHi on the dominant side and lenLo on the
        // other (the empty sum 0 is covered when lenLo = 0, as er·0 = 0).
        const lo = er.lo < 0 ? er.lo * lt.lenHi : er.lo * lt.lenLo;
        const hi = er.hi > 0 ? er.hi * lt.lenHi : er.hi * lt.lenLo;
        return finish(
          { kind: "call", name: "sum", args: [list.node] },
          ir(lo, hi, false),
        );
      }

      case "count": {
        const list = this.genList(dec(depth), env);
        const lt = list.ty;
        if (lt.k !== "list") return null;
        const closure = this.genClosure([lt.elem], boolTy, dec(depth), env);
        return finish(
          {
            kind: "call",
            name: "count",
            args: [list.node, closure.node],
            trail: true,
          },
          ir(0, lt.lenHi, false),
        );
      }

      case "at":
      case "head": {
        const src = this.genListish(dec(depth), env);
        const st = src.ty;
        let elem: Ty;
        let node: Node;
        if (st.k === "pair") {
          if (kind === "at") {
            const idx = this.rng.int(0, 1);
            elem = idx === 0 ? st.a : st.b;
            node = {
              kind: "call",
              name: "at",
              args: [src.node, { kind: "int", v: idx }],
            };
          } else {
            elem = st.a;
            node = { kind: "call", name: "head", args: [src.node] };
          }
        } else if (st.k === "list") {
          if (st.lenLo < 1) return null; // in-bounds indices need lenLo ≥ 1
          if (kind === "at") {
            elem = st.elem;
            node = {
              kind: "call",
              name: "at",
              args: [src.node, { kind: "int", v: this.rng.int(0, st.lenLo - 1) }],
            };
          } else {
            elem = st.elem;
            node = { kind: "call", name: "head", args: [src.node] };
          }
        } else return null;
        return finish(node, elem.k === "int" ? elem.r : null);
      }

      case "cap":
        return this.genCaptureCall(depth, env, c);

      // ---- v0.7 builtins (nova/docs/v0.7-contracts.md) ----------------------

      case "abs": {
        const g = sub();
        if (!g.r) return null;
        return finish({ kind: "call", name: "abs", args: [g.node] }, rAbs(g.r));
      }

      case "count1": {
        // count/1: length WITHOUT forcing elements (contract) — no RNG
        // interaction regardless of element dice.
        const list = this.genList(dec(depth), env);
        const lt = list.ty;
        if (lt.k !== "list") return null;
        return finish(
          { kind: "call", name: "count", args: [list.node] },
          ir(lt.lenLo, lt.lenHi, lt.lenLo === lt.lenHi),
        );
      }

      case "min":
      case "max": {
        const list = this.genList(dec(depth), env);
        const lt = list.ty;
        if (lt.k !== "list" || lt.elem.k !== "int" || !lt.elem.r) return null;
        // `[]` errors with 列表为空 (key 44) — the normal path stays
        // error-free (emptyV07 sketchy template covers the error), so
        // non-empty lists only. Result ⊆ element range (extremes sit at
        // the endpoints; a single-element list reaches every interval
        // value).
        if (lt.lenLo < 1) return null;
        return finish(
          { kind: "call", name: kind, args: [list.node] },
          lt.elem.r,
        );
      }

      case "at3": {
        // at/3: never errors on OOB — yields the (unforced) default.
        const src = this.genList(dec(depth), env);
        const st = src.ty;
        if (st.k !== "list" || st.elem.k !== "int" || !st.elem.r) return null;
        // Negative indices (bare `-k`, verified in delimited positions)
        // are always OOB.
        const idx = this.rng.int(-1, st.lenHi + 1);
        const dflt = this.genInt(dec(depth), env, ANY);
        if (!dflt.r) return null;
        let r: Range;
        if (idx < 0 || idx >= st.lenHi) r = dflt.r; // surely OOB
        else if (idx < st.lenLo) r = st.elem.r; // surely in range
        else r = rUnion([st.elem.r, dflt.r]); // length uncertain
        return finish(
          {
            kind: "call",
            name: "at",
            args: [src.node, { kind: "int", v: idx }, dflt.node],
          },
          r,
        );
      }

      case "last": {
        const src = this.genList(dec(depth), env);
        const st = src.ty;
        if (st.k !== "list" || st.lenLo < 1 || st.elem.k !== "int" || !st.elem.r) {
          return null; // `[]` → 列表为空; emptyV07 sketchy covers it
        }
        return finish(
          { kind: "call", name: "last", args: [src.node] },
          st.elem.r,
        );
      }

      case "foldl":
      case "foldr": {
        // Fold bodies are dice-free templates (params + literals only).
        // Elements/init may carry dice for BOTH folds: foldl is strict
        // (identical forcing order in both impls — verified:
        // foldl([d2, d100], d1000, |$a, $e| $a - $e) agrees across
        // seeds); foldr's deferred calls execute outer-in in both impls
        // (naive's right-to-left-at-construction divergence was a real
        // bug, fixed in v0.7 — see the header). Inputs are shallow by
        // construction (foldr's nested lazy calls overflow both impls
        // only at ≳10³ — compat #6).
        const list = this.genList(dec(depth), env);
        const lt = list.ty;
        if (lt.k !== "list" || lt.elem.k !== "int" || !lt.elem.r) return null;
        const listNode = list.node;
        const elemRange = lt.elem.r;
        const lenHi = lt.lenHi;
        const init = this.genInt(dec(depth), env, ANY);
        if (!init.r) return null;
        const tmpl = this.rng.weighted([
          ["+", 40],
          ["-", 25],
          ["e-a", 15],
          ["*", 20],
        ]);
        if (tmpl === "*") {
          // `-0` symbolism, as for the `*` operator (JSON normalizes).
          const accZero = init.r!.lo === 0 && init.r!.hi === 0;
          const elemZero = elemRange.lo === 0 && elemRange.hi === 0;
          if ((accZero && elemRange.lo < 0) || (elemZero && init.r!.lo < 0)) {
            return null;
          }
        }
        const acc = this.freshName();
        const el = this.freshName();
        // foldl: f(acc, elem); foldr: f(elem, acc).
        const accVar = { kind: "var" as const, name: acc };
        const elVar = { kind: "var" as const, name: el };
        const body: Node =
          tmpl === "+"
            ? { kind: "bin", op: "+", l: accVar, r: elVar }
            : tmpl === "-"
            ? { kind: "bin", op: "-", l: accVar, r: elVar }
            : tmpl === "e-a"
            ? { kind: "bin", op: "-", l: elVar, r: accVar }
            : { kind: "bin", op: "*", l: accVar, r: elVar };
        const closure: Node = {
          kind: "closure",
          params: kind === "foldl" ? [acc, el] : [el, acc],
          body,
        };
        // Range: fold the op over ≤ lenHi elements. Op ranges are NOT
        // monotone (×−1 alternates), so union every step count 0..lenHi;
        // an overflowing step must reject the whole shape (a truncated
        // union would claim a bounded range while deeper folds overflow
        // at runtime — nova errors, naive's f64 silently continues).
        const er = elemRange;
        const parts: Range[] = [init.r!];
        let r: Range = init.r!;
        for (let i = 0; i < lenHi; i++) {
          r = tmpl === "+"
            ? rAdd(r, er)
            : tmpl === "-"
            ? rSub(r, er)
            : tmpl === "e-a"
            ? rSub(er, r)
            : rMul(r, er);
          if (r === null) return null;
          parts.push(r);
        }
        return finish(
          {
            kind: "call",
            name: kind,
            args: [listNode, init.node, closure],
            trail: true,
          },
          rUnion(parts),
        );
      }

      case "apply": {
        if (depth < 3) return null;
        const two = this.rng.chance(0.25);
        const pRange = ir(this.rng.int(0, 6), this.rng.int(12, 40), false);
        const params = two ? [pRange, pRange] : [pRange];
        const names = params.map(() => this.freshName());
        const inner: Env = {
          vars: [
            ...env.vars,
            ...names.map((name, i) => ({ name, ty: intTy(params[i]!) })),
          ],
        };
        const body = this.genInt(dec(depth), inner, ANY);
        if (!body.r) return null;
        const closure: Node = { kind: "closure", params: names, body: body.node };
        // compat #9 (map/zipWith error beacon): args used to be generated
        // under ANY while the body's static range was computed assuming the
        // param lies in pRange — an out-of-range arg could then violate any
        // range-based guarantee at runtime (found live as a `%` divisor of
        // −431), and inside a map/zipWith closure body that poisoned naive's
        // error beacon. Constraining args to the param range makes every
        // static range sound, so normal-path programs cannot error at all.
        const args = params.map(
          (p) => this.genInt(dec(depth), env, { minLo: p.lo, maxHi: p.hi }),
        );
        return finish(
          { kind: "valueCall", callee: closure, args: args.map((a) => a.node) },
          body.r,
        );
      }

      case "reroll":
      case "explode":
        return this.genTransformerInt(kind, c);

      default:
        return null;
    }
  }

  // ---- boolean expressions ------------------------------------------------

  private genBool(depth: number, env: Env): { node: Node; ret: Ty } {
    const table: [string, number][] = [
      ["lit", 22],
      ["cmp", 42],
      ["eq", 18],
      ["not", 10],
      ["apply", 2],
      // v0.7 (nova/docs/v0.7-contracts.md, operators section)
      ["boolCmp", 7],
      ["has", 6],
    ];
    if (env.vars.some((v) => v.ty.k === "bool")) table.push(["var", 12]);
    const build = (): { node: Node; ret: Ty } | null => {
      const kind = depth <= 0
        ? this.rng.weighted([["lit", 60], ["var", 40]] as [string, number][])
        : this.rng.weighted(table);
      switch (kind) {
        case "lit":
          return { node: { kind: "bool", v: this.rng.chance(0.5) }, ret: boolTy };
        case "var": {
          const vs = env.vars.filter((v) => v.ty.k === "bool");
          if (!vs.length) return null;
          return {
            node: { kind: "var", name: this.rng.pick(vs).name },
            ret: boolTy,
          };
        }
        case "cmp": {
          const op = this.rng.pick(["<", ">", "<=", ">="] as const);
          const a = this.genInt(dec(depth), env, ANY);
          const b = this.genInt(dec(depth), env, ANY);
          return {
            node: { kind: "cmp", op, l: a.node, r: b.node },
            ret: boolTy,
          };
        }
        case "eq": {
          const op = this.rng.pick(["==", "!="] as const);
          if (this.rng.chance(0.7)) {
            const a = this.genInt(dec(depth), env, ANY);
            const b = this.genInt(dec(depth), env, ANY);
            return {
              node: { kind: "cmp", op, l: a.node, r: b.node },
              ret: boolTy,
            };
          }
          const a = this.genBool(dec(depth), env);
          const b = this.genBool(dec(depth), env);
          return {
            node: { kind: "cmp", op, l: a.node, r: b.node },
            ret: boolTy,
          };
        }
        case "not": {
          const x = this.genBool(dec(depth), env);
          return { node: { kind: "not", x: x.node }, ret: boolTy };
        }
        case "apply": {
          if (depth < 3) return null;
          const name = this.freshName();
          // compat #9 (map/zipWith error beacon): as in genInt's apply —
          // the arg is constrained to the param's range so every static
          // range stays sound (an out-of-range arg could otherwise make an
          // embedded expression error at runtime and poison naive's error
          // beacon from inside a map/zipWith closure body).
          const pRange = ir(0, 20, false);
          const inner: Env = {
            vars: [...env.vars, { name, ty: intTy(pRange) }],
          };
          const body = this.genBool(dec(depth), inner);
          const arg = this.genInt(dec(depth), env, { minLo: 0, maxHi: 20 });
          return {
            node: {
              kind: "valueCall",
              callee: { kind: "closure", params: [name], body: body.node },
              args: [arg.node],
            },
            ret: boolTy,
          };
        }
        // ---- v0.7 (nova/docs/v0.7-contracts.md) ---------------------------

        case "boolCmp": {
          // `<`/`>`/`<=`/`>=` over booleans (false < true), homogeneous
          // operands — mixed int/bool errors with key 42 and stays off
          // the normal error-free path. Comparison captures stay out
          // (compat #10 — naive's parser rejects `&</2`).
          const op = this.rng.pick(["<", ">", "<=", ">="] as const);
          const a = this.genBool(dec(depth), env);
          const b = this.genBool(dec(depth), env);
          return {
            node: { kind: "cmp", op, l: a.node, r: b.node },
            ret: boolTy,
          };
        }

        case "has": {
          // has?/2 over flat int/bool lists; the needle is scalar (a
          // list/pair element would be a key-50 error — off the normal
          // path). Cross-type needles are simply unequal (contract).
          // Both impls short-circuit at the first match identically
          // (new in both), so dice in elements/needle are safe.
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          if (lt.elem.k !== "int" && lt.elem.k !== "bool") return null;
          const needleInt = lt.elem.k === "int"
            ? this.rng.chance(0.7)
            : this.rng.chance(0.3);
          const needle = needleInt
            ? this.genInt(dec(depth), env, ANY).node
            : this.genBool(dec(depth), env).node;
          return {
            node: { kind: "call", name: "has?", args: [list.node, needle] },
            ret: boolTy,
          };
        }
        default:
          return null;
      }
    };
    for (let attempt = 0; attempt < 8; attempt++) {
      const g = build();
      if (g) return g;
    }
    return { node: { kind: "bool", v: this.rng.chance(0.5) }, ret: boolTy };
  }

  // ---- list expressions ---------------------------------------------------

  private genList(depth: number, env: Env): ListGen {
    const table: [string, number][] = [
      ["listLit", 26],
      ["repeat", 24],
      ["map", 14],
      ["filter", 9],
      ["zip", 5],
      ["zipWith", 6],
      ["tail", 5],
      ["append", 5],
      ["sort", 6],
      ["reroll", 3],
      ["explode", 1],
      // v0.7 builtins (nova/docs/v0.7-contracts.md)
      ["reverse", 3],
      ["concat", 3.5],
      ["prepend", 3.5],
      ["init", 2],
      ["takeList", 3],
      ["dropList", 3],
      ["takeWhile", 3],
      ["dropWhile", 3],
      ["flatMap", 3],
      ["sort2", 3.5],
      ["duplicate", 3],
      ["flatten", 3],
      ["flattenAll", 2.5],
      ["takeSeq", 3],
    ];
    const build = (): ListGen | null => {
      const kind = depth <= 0
        ? this.rng.weighted([["listLit", 55], ["repeat", 45]] as [string, number][])
        : this.rng.weighted(table);
      switch (kind) {
        case "listLit": {
          const len = this.rng.weighted([
            [0, 4],
            [1, 8],
            [2, 22],
            [3, 26],
            [4, 22],
            [5, 12],
            [6, 6],
          ]);
          const elemRoll = this.rng.float();
          if (elemRoll < 0.85) {
            const elems: IntGen[] = [];
            for (let i = 0; i < len; i++) {
              elems.push(this.genInt(dec(depth), env, ANY));
            }
            return {
              node: { kind: "listLit", xs: elems.map((e) => e.node) },
              ty: {
                k: "list",
                // Empty → [0, 0]: no element exists, so any claim is
                // vacuous — but [∞, −∞] (rUnion([]) before its null fix)
                // "fits" every constraint and poisons range arithmetic.
                elem: intTy(rUnion(elems.map((e) => e.r)) ?? ir(0, 0, true)),
                lenLo: len,
                lenHi: len,
              },
            };
          }
          if (elemRoll < 0.95) {
            const elems: Node[] = [];
            for (let i = 0; i < len; i++) {
              elems.push(this.genBool(dec(depth), env).node);
            }
            return {
              node: { kind: "listLit", xs: elems },
              ty: { k: "list", elem: boolTy, lenLo: len, lenHi: len },
            };
          }
          // Nested lists (nesting ≤ 2): inner lists hold integers.
          const elems: Node[] = [];
          const innerRanges: Range[] = [];
          for (let i = 0; i < len; i++) {
            const innerLen = this.rng.int(0, 3);
            const inner: Node[] = [];
            for (let j = 0; j < innerLen; j++) {
              inner.push({ kind: "int", v: this.rng.int(0, 9) });
            }
            innerRanges.push(ir(0, 9, true));
            elems.push({ kind: "listLit", xs: inner });
          }
          return {
            node: { kind: "listLit", xs: elems },
            ty: {
              k: "list",
              elem: { k: "list", elem: intTy(rUnion(innerRanges)), lenLo: 0, lenHi: 3 },
              lenLo: len,
              lenHi: len,
            },
          };
        }
        case "repeat": {
          const count = this.rng.weighted([
            [this.rng.int(2, 5), 55],
            [this.rng.int(6, 8), 30],
            [1, 8],
            [0, 7],
          ]);
          const isBool = this.rng.chance(0.08);
          if (isBool) {
            const body = this.genBool(dec(depth), env);
            return {
              node: { kind: "repeat", count, body: body.node },
              ty: { k: "list", elem: boolTy, lenLo: count, lenHi: count },
            };
          }
          const body = this.genRepeatBody(dec(depth), env);
          return {
            node: { kind: "repeat", count, body: body.node },
            ty: {
              k: "list",
              elem: intTy(body.r),
              lenLo: count,
              lenHi: count,
            },
          };
        }
        case "map": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          const retInt = this.rng.chance(0.75);
          const closure = this.genClosure(
            [lt.elem],
            retInt ? intTy(null) : boolTy,
            dec(depth),
            env,
          );
          return {
            node: {
              kind: "call",
              name: "map",
              args: [list.node, closure.node],
              trail: true,
            },
            ty: {
              k: "list",
              elem: closure.ret,
              lenLo: lt.lenLo,
              lenHi: lt.lenHi,
            },
          };
        }
        case "filter": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          const closure = this.genClosure([lt.elem], boolTy, dec(depth), env);
          return {
            node: {
              kind: "call",
              name: "filter",
              args: [list.node, closure.node],
              trail: true,
            },
            ty: { k: "list", elem: lt.elem, lenLo: 0, lenHi: lt.lenHi },
          };
        }
        case "zip": {
          const l1 = this.genList(dec(depth), env);
          const l2 = this.genList(dec(depth), env);
          const t1 = l1.ty;
          const t2 = l2.ty;
          if (t1.k !== "list" || t2.k !== "list") return null;
          return {
            node: { kind: "call", name: "zip", args: [l1.node, l2.node] },
            ty: {
              k: "list",
              elem: { k: "pair", a: t1.elem, b: t2.elem },
              lenLo: Math.min(t1.lenLo, t2.lenLo),
              lenHi: Math.min(t1.lenHi, t2.lenHi),
            },
          };
        }
        case "zipWith": {
          const l1 = this.genList(dec(depth), env);
          const l2 = this.genList(dec(depth), env);
          const t1 = l1.ty;
          const t2 = l2.ty;
          if (t1.k !== "list" || t2.k !== "list") return null;
          const retInt = this.rng.chance(0.85);
          const closure = this.genClosure(
            [t1.elem, t2.elem],
            retInt ? intTy(null) : boolTy,
            dec(depth),
            env,
          );
          return {
            node: {
              kind: "call",
              name: "zipWith",
              args: [l1.node, l2.node, closure.node],
              trail: true,
            },
            ty: {
              k: "list",
              elem: closure.ret,
              lenLo: Math.min(t1.lenLo, t2.lenLo),
              lenHi: Math.min(t1.lenHi, t2.lenHi),
            },
          };
        }
        case "tail": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list" || lt.lenLo < 2) return null;
          return {
            node: { kind: "call", name: "tail", args: [list.node] },
            ty: {
              k: "list",
              elem: lt.elem,
              lenLo: Math.max(0, lt.lenLo - 1),
              lenHi: lt.lenHi - 1,
            },
          };
        }
        case "append": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          // Element types must match (homogeneous lists only). The
          // appended element WIDENS the claimed element range (it used to
          // be dropped, an unsound claim: the appended literal could sit
          // outside it — soundness over precision, like everywhere else).
          if (lt.elem.k === "int") {
            const g = this.genInt(dec(depth), env, ANY);
            if (!g.r) return null;
            const ur = rUnion([lt.elem.r, g.r]);
            if (!ur) return null;
            return {
              node: { kind: "call", name: "append", args: [list.node, g.node] },
              ty: {
                k: "list",
                elem: intTy(ur),
                lenLo: lt.lenLo + 1,
                lenHi: lt.lenHi + 1,
              },
            };
          }
          if (lt.elem.k === "bool") {
            const el = this.genBool(dec(depth), env).node;
            return {
              node: { kind: "call", name: "append", args: [list.node, el] },
              ty: {
                k: "list",
                elem: lt.elem,
                lenLo: lt.lenLo + 1,
                lenHi: lt.lenHi + 1,
              },
            };
          }
          return null;
        }
        case "sort": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          // sort supports integer/boolean elements only.
          if (lt.elem.k !== "int" && lt.elem.k !== "bool") return null;
          return {
            node: { kind: "call", name: "sort", args: [list.node] },
            ty: lt,
          };
        }

        // ---- v0.7 builtins (nova/docs/v0.7-contracts.md) --------------------

        case "reverse": {
          const list = this.genList(dec(depth), env);
          if (list.ty.k !== "list") return null;
          return {
            node: { kind: "call", name: "reverse", args: [list.node] },
            ty: list.ty,
          };
        }

        case "concat": {
          const l1 = this.genList(dec(depth), env);
          const l2 = this.genList(dec(depth), env);
          const t1 = l1.ty;
          const t2 = l2.ty;
          if (t1.k !== "list" || t2.k !== "list") return null;
          // Homogeneous concatenation (mixed elements would break the
          // lattice); ranges union. Pair elements stay out (their a/b
          // component unions are not worth the machinery).
          let elem: Ty;
          if (t1.elem.k === "int" && t2.elem.k === "int") {
            if (!t1.elem.r || !t2.elem.r) return null;
            const ur = rUnion([t1.elem.r, t2.elem.r]);
            if (!ur) return null;
            elem = intTy(ur);
          } else if (t1.elem.k === "bool" && t2.elem.k === "bool") {
            elem = boolTy;
          } else if (t1.elem.k === "list" && t2.elem.k === "list") {
            const i1 = t1.elem;
            const i2 = t2.elem;
            if (i1.elem.k !== "int" || i2.elem.k !== "int") return null;
            if (!i1.elem.r || !i2.elem.r) return null;
            const ur = rUnion([i1.elem.r, i2.elem.r]);
            if (!ur) return null;
            elem = {
              k: "list",
              elem: intTy(ur),
              lenLo: Math.min(i1.lenLo, i2.lenLo),
              lenHi: Math.max(i1.lenHi, i2.lenHi),
            };
          } else return null;
          return {
            node: { kind: "call", name: "concat", args: [l1.node, l2.node] },
            ty: {
              k: "list",
              elem,
              lenLo: t1.lenLo + t2.lenLo,
              lenHi: t1.lenHi + t2.lenHi,
            },
          };
        }

        case "prepend": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          if (lt.elem.k === "int") {
            const g = this.genInt(dec(depth), env, ANY);
            if (!g.r) return null;
            const ur = rUnion([lt.elem.r, g.r]);
            if (!ur) return null;
            return {
              node: {
                kind: "call",
                name: "prepend",
                args: [list.node, g.node],
              },
              ty: {
                k: "list",
                elem: intTy(ur),
                lenLo: lt.lenLo + 1,
                lenHi: lt.lenHi + 1,
              },
            };
          }
          if (lt.elem.k === "bool") {
            const el = this.genBool(dec(depth), env).node;
            return {
              node: {
                kind: "call",
                name: "prepend",
                args: [list.node, el],
              },
              ty: {
                k: "list",
                elem: boolTy,
                lenLo: lt.lenLo + 1,
                lenHi: lt.lenHi + 1,
              },
            };
          }
          return null; // nested-list elements: prepend stays int/bool
        }

        case "init": {
          // All but last; `[]` → 列表为空 (key 44) — non-empty only
          // (emptyV07 sketchy covers the error shape).
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list" || lt.lenLo < 1) return null;
          return {
            node: { kind: "call", name: "init", args: [list.node] },
            ty: {
              k: "list",
              elem: lt.elem,
              lenLo: Math.max(0, lt.lenLo - 1),
              lenHi: lt.lenHi - 1,
            },
          };
        }

        case "takeList":
        case "dropList": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          // Sequence-source inputs are excluded from BOTH: a raw
          // repetition AND a reroll/explode transformer result are
          // sequences — `take` pulls past the nominal end (exactly k
          // items, so min(k, len) would be unsound), and `drop`'s lazy
          // skip can pass the nominal-last marker (drop(5#d6, 7),
          // drop(explode(3#d9, …), 6)) making the result's list cast
          // UNBOUNDED — the must-not-fuzz shape (found live as nova
          // 内存不足 / naive heap OOM). Sequence takes go through
          // `takeSeq` only (len = k, bounded).
          if (isSequenceNode(list.node)) return null;
          if (kind === "takeList") {
            const n = this.rng.weighted([
              [this.rng.int(0, 3), 55],
              [this.rng.int(4, 7), 30],
              [-1, 15],
            ]);
            const k = Math.max(n, 0); // n ≤ 0 → []
            return {
              node: {
                kind: "call",
                name: "take",
                args: [list.node, { kind: "int", v: n }],
              },
              ty: {
                k: "list",
                elem: lt.elem,
                lenLo: Math.min(k, lt.lenLo),
                lenHi: Math.min(k, lt.lenHi),
              },
            };
          }
          const n = this.rng.int(-1, lt.lenHi + 2);
          // n ≤ 0 → the input (copy); else handles from index min(n, len).
          const lenLo = n <= 0 ? lt.lenLo : Math.max(0, lt.lenLo - n);
          const lenHi = n <= 0 ? lt.lenHi : Math.max(0, lt.lenHi - n);
          return {
            node: {
              kind: "call",
              name: "drop",
              args: [list.node, { kind: "int", v: n }],
            },
            ty: { k: "list", elem: lt.elem, lenLo, lenHi },
          };
        }

        case "takeWhile":
        case "dropWhile": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list") return null;
          if (lt.elem.k !== "int" && lt.elem.k !== "bool") return null;
          const p = this.genPurePredicate(lt.elem);
          return {
            node: {
              kind: "call",
              name: kind,
              args: [list.node, p],
              trail: true,
            },
            ty: { k: "list", elem: lt.elem, lenLo: 0, lenHi: lt.lenHi },
          };
        }

        case "flatMap": {
          const list = this.genList(dec(depth), env);
          const lt = list.ty;
          if (lt.k !== "list" || lt.elem.k !== "int" || !lt.elem.r) return null;
          // Pure body (template-built: param + literals only) returning a
          // fixed-length bounded list; elements of the input may hold dice
          // (f is called per element in list order in both impls).
          const w = this.rng.int(0, 3);
          const name = this.freshName();
          const paramTy = lt.elem;
          const xs: Node[] = [];
          const innerRanges: Range[] = [];
          for (let i = 0; i < w; i++) {
            const g = this.genPureIntExpr(name, paramTy);
            xs.push(g.node);
            innerRanges.push(g.r);
          }
          const closure: Node = {
            kind: "closure",
            params: [name],
            body: { kind: "listLit", xs },
          };
          return {
            node: {
              kind: "call",
              name: "flatMap",
              args: [list.node, closure],
              trail: true,
            },
            ty: {
              k: "list",
              elem: intTy(w === 0 ? ir(0, 0, true) : rUnion(innerRanges)),
              lenLo: lt.lenLo * w,
              lenHi: lt.lenHi * w,
            },
          };
        }

        case "sort2": {
          // sort/2: pure, CONSISTENT comparator (stable sorts of both
          // impls agree on the result for consistent comparators);
          // literal-scalar input — the comparator forces element handles
          // in comparison order (which differs per impl), so dice-carrying
          // elements with differing per-element draw counts could permute
          // the drawn multiset. Literals sidestep the stream entirely.
          const len = this.rng.int(0, 6);
          const isBool = this.rng.chance(0.25);
          const xs: Node[] = [];
          const rs: Range[] = [];
          for (let i = 0; i < len; i++) {
            if (isBool) {
              xs.push({ kind: "bool", v: this.rng.chance(0.5) });
            } else {
              const roll = this.rng.float();
              if (roll < 0.15) {
                const k = this.rng.int(1, 9); // neg renders (-k), no -0
                xs.push({ kind: "neg", x: { kind: "int", v: k } });
                rs.push(ir(-k, -k, true));
              } else {
                const v = roll < 0.9 ? this.rng.int(0, 9) : this.rng.int(10, 99);
                xs.push({ kind: "int", v });
                rs.push(ir(v, v, true));
              }
            }
          }
          const cmpOp = this.rng.weighted([
            ["<=", 40],
            [">=", 40],
            ["<", 10],
            [">", 10],
          ]) as "<=" | ">=" | "<" | ">";
          const a = this.freshName();
          const b = this.freshName();
          const closure: Node = {
            kind: "closure",
            params: [a, b],
            body: {
              kind: "cmp",
              op: cmpOp,
              l: { kind: "var", name: a },
              r: { kind: "var", name: b },
            },
          };
          return {
            node: {
              kind: "call",
              name: "sort",
              args: [{ kind: "listLit", xs }, closure],
              trail: true,
            },
            ty: {
              k: "list",
              elem: isBool ? boolTy : intTy(rUnion(rs) ?? ir(0, 0, true)),
              lenLo: len,
              lenHi: len,
            },
          };
        }

        case "duplicate": {
          // duplicate/2 pins its value (ONE evaluation — `duplicate(d6, 3)`
          // consumes one draw in both impls, contract); counts ≤ 4.
          const count = this.rng.int(0, 4);
          if (this.rng.chance(0.15)) {
            const v = this.genBool(dec(depth), env);
            return {
              node: {
                kind: "call",
                name: "duplicate",
                args: [v.node, { kind: "int", v: count }],
              },
              ty: { k: "list", elem: boolTy, lenLo: count, lenHi: count },
            };
          }
          const v = this.genInt(dec(depth), env, ANY);
          if (!v.r) return null;
          return {
            node: {
              kind: "call",
              name: "duplicate",
              args: [v.node, { kind: "int", v: count }],
            },
            ty: {
              k: "list",
              elem: intTy(v.r),
              lenLo: count,
              lenHi: count,
            },
          };
        }

        case "flatten":
        case "flattenAll": {
          // Nested-lattice input (outer ≤ 4 literal inner lists ≤ 3,
          // integers inside — dice allowed, they stay unforced at the
          // depth boundary), plus repetition elements exercising the
          // sequence→list splice of the listness test (contract).
          const outerLen = this.rng.int(0, 4);
          const xs: Node[] = [];
          const innerRanges: Range[] = [];
          for (let i = 0; i < outerLen; i++) {
            if (this.rng.chance(0.75)) {
              const innerLen = this.rng.int(0, 3);
              const inner: Node[] = [];
              for (let j = 0; j < innerLen; j++) {
                const g = this.genInt(dec(depth), env, ANY);
                if (!g.r) return null;
                inner.push(g.node);
                innerRanges.push(g.r);
              }
              xs.push({ kind: "listLit", xs: inner });
            } else {
              const k = this.rng.int(1, 3);
              const body = this.genRepeatBody(0, EMPTY_ENV);
              if (!body.r) return null;
              xs.push({ kind: "repeat", count: k, body: body.node });
              innerRanges.push(body.r);
            }
          }
          const innerElem = rUnion(innerRanges) ?? ir(0, 9, true);
          if (kind === "flattenAll") {
            return {
              node: {
                kind: "call",
                name: "flattenAll",
                args: [{ kind: "listLit", xs }],
              },
              ty: {
                k: "list",
                elem: intTy(innerElem),
                lenLo: 0,
                lenHi: outerLen * 3,
              },
            };
          }
          const d = this.rng.weighted([[0, 20], [1, 55], [2, 25]]);
          if (d === 0) {
            // depth ≤ 0 → shallow handle copy — stays nested.
            return {
              node: {
                kind: "call",
                name: "flatten",
                args: [{ kind: "listLit", xs }, { kind: "int", v: 0 }],
              },
              ty: {
                k: "list",
                elem: { k: "list", elem: intTy(innerElem), lenLo: 0, lenHi: 3 },
                lenLo: outerLen,
                lenHi: outerLen,
              },
            };
          }
          return {
            node: {
              kind: "call",
              name: "flatten",
              args: [{ kind: "listLit", xs }, { kind: "int", v: d }],
            },
            ty: {
              k: "list",
              elem: intTy(innerElem),
              lenLo: 0,
              lenHi: outerLen * 3,
            },
          };
        }

        case "takeSeq": {
          return this.genTakeSequence(depth, env);
        }

        case "reroll":
        case "explode":
          return this.genTransformerList(kind);
        default:
          return null;
      }
    };
    for (let attempt = 0; attempt < 10; attempt++) {
      const g = build();
      if (g) return g;
    }
    // Fallback: a small integer list literal.
    const len = this.rng.int(1, 3);
    const xs: Node[] = [];
    for (let i = 0; i < len; i++) xs.push({ kind: "int", v: this.rng.int(0, 9) });
    return {
      node: { kind: "listLit", xs },
      ty: { k: "list", elem: intTy(ir(0, 9, true)), lenLo: len, lenHi: len },
    };
  }

  /** Dice-heavy bodies for `N#body` repetition, with the body's true value
   * distribution (needed when the sequence feeds a transformer — dice-sum
   * bodies are non-uniform). */
  private genRepeatBody(
    depth: number,
    env: Env,
  ): { node: Node; r: Range; dist: Dist } {
    const table: [string, number][] = [
      ["die1", 22],
      ["die2", 34],
      ["range", 16],
      ["urange", 8],
      ["lit", 12],
      ["+", 6],
      ["-", 2],
    ];
    type BodyGen = { node: Node; r: Range; dist: Dist };
    const build = (): BodyGen | null => {
      const kind = this.rng.weighted(
        depth <= 0
          ? [["die1", 30], ["die2", 45], ["range", 18], ["urange", 7]] as [string, number][]
          : table,
      );
      switch (kind) {
        case "die1": {
          const m = this.rng.int(2, 12);
          return {
            node: { kind: "die1", m },
            r: ir(1, m, true),
            dist: uniformDist(1, m),
          };
        }
        case "die2": {
          const n = this.rng.int(1, 5);
          const m = this.rng.int(2, 12);
          return {
            node: { kind: "die2", n, m },
            r: ir(n, n * m, true),
            dist: dieSumDist(n, m),
          };
        }
        case "range": {
          const rr = drawRange(this.rng);
          return {
            node: { kind: "range", a: rr.lo, b: rr.hi },
            r: rr,
            dist: uniformDist(rr.lo, rr.hi),
          };
        }
        case "urange": {
          const m = this.rng.int(1, 12);
          return {
            node: { kind: "urange", m },
            r: ir(1, m, true),
            dist: uniformDist(1, m),
          };
        }
        case "lit": {
          const v = this.rng.int(0, 9);
          return {
            node: { kind: "int", v },
            r: intLitRange(v),
            dist: singleDist(v),
          };
        }
        case "+":
        case "-": {
          const a = this.genRepeatBody(dec(depth), env);
          const b = this.genRepeatBody(dec(depth), env);
          if (!a.r || !b.r) return null;
          return {
            node: { kind: "bin", op: kind, l: a.node, r: b.node },
            r: kind === "+" ? rAdd(a.r, b.r) : rSub(a.r, b.r),
            dist: kind === "+"
              ? convolveAdd(a.dist, b.dist)
              : convolveSub(a.dist, b.dist),
          };
        }
        default:
          return null;
      }
    };
    for (let attempt = 0; attempt < 8; attempt++) {
      const g = build();
      if (g) return g;
    }
    const m = this.rng.int(2, 12);
    return {
      node: { kind: "die1", m },
      r: ir(1, m, true),
      dist: uniformDist(1, m),
    };
  }

  /** List-typed or pair-typed expression (for `at`/`head`). */
  private genListish(depth: number, env: Env): ListGen {
    const pairVars = env.vars.filter((v) => v.ty.k === "pair");
    if (pairVars.length && this.rng.chance(0.3)) {
      const v = this.rng.pick(pairVars);
      return { node: { kind: "var", name: v.name }, ty: v.ty };
    }
    return this.genList(depth, env);
  }

  // ---- closures ------------------------------------------------------------

  private genClosure(
    paramTys: Ty[],
    ret: Ty,
    depth: number,
    env: Env,
  ): { node: Node; ret: Ty } {
    const names = paramTys.map(() => this.freshName());
    const inner: Env = {
      vars: [...env.vars, ...names.map((name, i) => ({ name, ty: paramTys[i]! }))],
    };
    const body = ret.k === "int"
      ? this.genInt(depth, inner, ANY)
      : this.genBool(depth, inner);
    const used = collectVars(body.node);
    // `_` for an unused parameter (verified form `|$a, _| $a`).
    const params = names.map((n) =>
      !used.has(n) && paramTys.length > 1 && this.rng.chance(0.35) ? "_" : n
    );
    return {
      node: { kind: "closure", params, body: body.node },
      ret: ret.k === "int" ? intTy((body as IntGen).r) : boolTy,
    };
  }

  // ---- v0.7 pure templates ---------------------------------------------------

  /**
   * Pure (dice-free, error-free) boolean predicate over one parameter for
   * `takeWhile/2`/`dropWhile/2` (v0.7 contract): comparisons of the
   * element against a literal — boolean-producing over the element type.
   * Template-built (param + literals only) so purity holds by
   * construction.
   */
  private genPurePredicate(elem: Ty): Node {
    const name = this.freshName();
    if (elem.k === "bool") {
      const op = this.rng.pick(["==", "!="] as const);
      return {
        kind: "closure",
        params: [name],
        body: {
          kind: "cmp",
          op,
          l: { kind: "var", name },
          r: { kind: "bool", v: this.rng.chance(0.5) },
        },
      };
    }
    const r = elem.k === "int" ? elem.r : null;
    // k near the element range keeps predicates meaningful; guard against
    // a non-finite k (a broken range could yield NaN — belt and braces,
    // rUnion([]) is fixed but ranges flow from many places).
    const kRaw = r ? this.rng.int(r.lo - 2, r.hi + 2) : this.rng.int(-2, 11);
    const k = Number.isFinite(kRaw) ? kRaw : this.rng.int(-2, 11);
    const op = this.rng.pick(["<", "<=", ">", ">=", "==", "!="] as const);
    return {
      kind: "closure",
      params: [name],
      body: {
        kind: "cmp",
        op,
        l: { kind: "var", name },
        r: { kind: "int", v: k },
      },
    };
  }

  /** Pure int expression over one int parameter (flatMap body elements):
   * param + literals combined by one arithmetic op — sound range kept
   * (`null` propagates: an overflowing claim must stay unbounded, not
   * silently shrink back to the param's range). */
  private genPureIntExpr(name: string, paramTy: Ty): IntGen {
    const r = paramTy.k === "int" ? paramTy.r : null;
    const v = { kind: "var" as const, name };
    const c = this.rng.int(1, 5);
    const lit = this.rng.int(0, 9);
    const pick = this.rng.weighted([
      ["id", 20],
      ["+", 30],
      ["-", 20],
      ["*", 20],
      ["lit", 10],
    ]);
    if (!r) {
      return { node: { kind: "int", v: lit }, r: intLitRange(lit) };
    }
    switch (pick) {
      case "id":
        return { node: v, r };
      case "+":
        return {
          node: { kind: "bin", op: "+", l: v, r: { kind: "int", v: c } },
          r: rAdd(r, intLitRange(c)),
        };
      case "-":
        return {
          node: { kind: "bin", op: "-", l: v, r: { kind: "int", v: c } },
          r: rSub(r, intLitRange(c)),
        };
      case "*": {
        // c ≥ 1 (no `-0` from `* 0`; JSON would normalize it anyway).
        return {
          node: { kind: "bin", op: "*", l: v, r: { kind: "int", v: c } },
          r: rMul(r, intLitRange(c)),
        };
      }
      default:
        return { node: { kind: "int", v: lit }, r: intLitRange(lit) };
    }
  }

  /**
   * `take/2` over a SEQUENCE source (v0.7): dice sources (`take(d6, 3)`
   * = 3 rolls — pulls past nominal, both impls agree), optionally behind
   * a lazy `drop/2`, and `iterate/2` — ALWAYS bounded by the `take`:
   * the bare iterate/drop-of-dice sequence is infinite, and casting it
   * to a list is unbounded (nova memory-limit error vs naive hang — an
   * intended asymmetry, never fuzzed; v0.7 contract). `unfold/2` is not
   * generated: a meaningful terminating step closure needs an `if`
   * (absent this iteration), so iterate+take covers the sequence-producer
   * story. The next-function is pure (param + literal, one op).
   */
  private genTakeSequence(depth: number, env: Env): ListGen | null {
    const shape = this.rng.weighted([
      ["dice", 40],
      ["diceDrop", 15],
      ["repeat", 15],
      ["iterate", 20],
      ["iterateDrop", 10],
    ]);
    if (shape !== "iterate" && shape !== "iterateDrop") {
      let srcNode: Node;
      let elemRange: IntRange;
      if (shape === "repeat") {
        const n = this.rng.int(1, 5);
        const body = this.genRepeatBody(1, EMPTY_ENV);
        if (!body.r) return null;
        srcNode = { kind: "repeat", count: n, body: body.node };
        elemRange = body.r;
      } else {
        const src = this.genDiceSource();
        srcNode = src.node;
        elemRange = src.elemRange;
        if (shape === "diceDrop") {
          const j = this.rng.int(0, 3);
          if (j > 0) {
            srcNode = {
              kind: "call",
              name: "drop",
              args: [srcNode, { kind: "int", v: j }],
            };
          }
        }
      }
      const k = this.rng.int(0, 5);
      return {
        node: {
          kind: "call",
          name: "take",
          args: [srcNode, { kind: "int", v: k }],
        },
        ty: {
          k: "list",
          elem: intTy(elemRange),
          lenLo: k, // dice streams pull past nominal: exactly k items
          lenHi: k,
        },
      };
    }
    // iterate: pure next-function over the accumulator.
    const start = this.genInt(dec(depth), env, ANY);
    if (!start.r) return null;
    const name = this.freshName();
    const acc = { kind: "var" as const, name };
    const c = this.rng.int(1, 5);
    const mulC = this.rng.int(0, 3);
    const fKind = this.rng.weighted([
      ["id", 10],
      ["add", 35],
      ["sub", 25],
      ["mul", 30],
    ]);
    const body: Node = fKind === "id"
      ? acc
      : fKind === "mul"
      ? { kind: "bin", op: "*", l: acc, r: { kind: "int", v: mulC } }
      : {
        kind: "bin",
        op: fKind === "add" ? "+" : "-",
        l: acc,
        r: { kind: "int", v: c },
      };
    const closure: Node = { kind: "closure", params: [name], body };
    const stepR = (r: IntRange): Range => {
      switch (fKind) {
        case "id":
          return r;
        case "add":
          return rAdd(r, intLitRange(c));
        case "sub":
          return rSub(r, intLitRange(c));
        default:
          return rMul(r, intLitRange(mulC));
      }
    };
    const j = shape === "iterateDrop" ? this.rng.int(0, 2) : 0;
    const k = this.rng.int(1, 4);
    // Element range: r_i = f applied i times to start's range; the taken
    // window is r_j..r_{j+k−1}. f's ranges are not monotone (`* 0`
    // collapses), so union the window — sound, ≤ 6 iterations.
    const rs: IntRange[] = [start.r];
    let cur: Range = start.r;
    for (let i = 0; i < j + k - 1; i++) {
      cur = stepR(cur);
      if (cur === null) return null;
      rs.push(cur);
    }
    const ur = rUnion(rs.slice(j));
    if (!ur) return null;
    let seqNode: Node = {
      kind: "call",
      name: "iterate",
      args: [start.node, closure],
      trail: true,
    };
    if (j > 0) {
      seqNode = { kind: "call", name: "drop", args: [seqNode, { kind: "int", v: j }] };
    }
    return {
      node: { kind: "call", name: "take", args: [seqNode, { kind: "int", v: k }] },
      ty: { k: "list", elem: intTy(ur), lenLo: k, lenHi: k },
    };
  }

  // ---- reroll/explode -------------------------------------------------------

  /** Pure boolean predicate over `$x` for reroll/explode (compat #9 — no
   * erroring or non-boolean bodies, no dice inside).
   *
   * `dist` = the true distribution of input values the transformer can
   * see (see genTransformerInt/List): reroll terminates iff some
   * positive-weight value FAILS the predicate (it is kept and settles the
   * debt); the kept fraction must additionally stay ≥ 1/64 so a stop is
   * expected within ≤ ~64 pulls per slot (dice sums are non-uniform — a
   * count-based check would let e.g. `$x != 60` over `5d12` reroll
   * millions of times). Explode keeps the exploding fraction ≤ 1/2
   * (bounding chains). Returns the predicate with its satisfied-set
   * predicate so chains can track kept values. */
  private genPredicate(
    dist: Dist,
    forExplode: boolean,
  ): { node: Node; sat: (x: number) => boolean } {
    const lo = dist.lo;
    const hi = dist.hi;
    const total = distTotal(dist);
    const build = (): { node: Node; sat: (x: number) => boolean } | null => {
      // Belt and braces: a NaN (or empty) total would make EVERY
      // comparison below false and silently bypass the termination
      // checks (a live convolveSub indexing bug slipped a
      // never-settling predicate through exactly this way — a hard
      // naive reroll OOM) — reject, falling back to the safe `false`
      // predicate below.
      if (!(total > 0)) return null;
      const negated = this.rng.chance(0.12);
      const op = negated
        ? negateCmp(this.rng.pick(["<=", "<", ">=", ">", "==", "!="] as const))
        : this.rng.pick(["<=", "<", ">=", ">", "==", "!="] as const);
      // k near the range keeps predicates meaningful.
      const k = this.rng.int(lo - 2, hi + 2);
      const satOp = (x: number): boolean => {
        switch (op) {
          case "<=":
            return x <= k;
          case "<":
            return x < k;
          case ">=":
            return x >= k;
          case ">":
            return x > k;
          case "==":
            return x === k;
          case "!=":
            return x !== k;
        }
      };
      // The *rendered* predicate is `not (cmp)` when negated — the reroll
      // condition is the negation of the inner comparison, and ALL checks
      // (termination, explode p, chain kept-sets) must use it.
      const reroll: (x: number) => boolean = negated
        ? (x) => !satOp(x)
        : satOp;
      let satWeight = 0;
      for (let i = 0; i < dist.weights.length; i++) {
        if (dist.weights[i]! > 0 && reroll(dist.lo + i)) {
          satWeight += dist.weights[i]!;
        }
      }
      const failWeight = total - satWeight;
      // Termination: a positive-weight value must fail the predicate, else
      // reroll never settles its debt (naive additionally grows its
      // `abandonedBefore` buffer unboundedly → OOM) and explode never
      // emits `last`.
      if (satWeight === total) return null;
      if (forExplode) {
        if (satWeight === 0) return null; // pointless pure pass-through
        if (satWeight / total > 0.5) return null; // bound chains (~1/2)
      } else if (failWeight * 64 < total) {
        // Speed: expect a stop within ≤ 64 pulls per slot.
        return null;
      }
      const inner: Node = {
        kind: "cmp",
        op,
        l: { kind: "var", name: "$x" },
        r: { kind: "int", v: k },
      };
      return {
        node: negated ? { kind: "not", x: inner } : inner,
        sat: reroll,
      };
    };
    for (let i = 0; i < 12; i++) {
      const g = build();
      if (g) return g;
    }
    // `false` — always a safe pass-through predicate.
    return {
      node: { kind: "bool", v: false },
      sat: () => false,
    };
  }

  /** reroll/explode over a dice source → summed integer (sequence$sum).
   *
   * Chained transformers are built here, tracking the true input
   * distribution per layer: a reroll layer's consumers only ever see its
   * KEPT values (inputs failing its predicate), while an explode layer
   * passes every value through and adds extras of the same distribution.
   * A second predicate checked only against the full source distribution
   * could hold on every kept value and reroll forever — hence the
   * per-layer distribution. */
  private genTransformerInt(kind: "reroll" | "explode", c: C): IntGen | null {
    const src = this.genDiceSource();
    let node: Node = src.node;
    let dist = src.dist;
    const layers = this.rng.chance(0.2) ? 2 : 1;
    for (let i = 0; i < layers; i++) {
      const op = i === 0 ? kind : this.rng.pick(["reroll", "explode"] as const);
      const pred = this.genPredicate(dist, op === "explode");
      node = {
        kind: "call",
        name: op,
        args: [node, { kind: "closure", params: ["$x"], body: pred.node }],
        trail: true,
      };
      if (op === "reroll") {
        // Consumers of this layer only see kept values.
        dist = filterDist(dist, (v) => !pred.sat(v));
      }
      // explode passes every value through (plus extras of the same
      // distribution) — the next layer's inputs stay the same.
    }
    // Kept/exploded values stay in the source's draw range; reroll keeps
    // exactly n slots, explode adds a geometric tail (p ≤ 1/2 → ≤ ~6n).
    const er = src.elemRange;
    const mult = kind === "explode" ? 6 : 1;
    const r = ir(
      Math.min(src.n * er.lo, src.n * er.hi),
      Math.max(src.n * mult * er.lo, src.n * mult * er.hi),
      false,
    );
    if (!fits(r, c)) return null;
    return { node, r };
  }

  /** reroll/explode over `N#body` → list (sequence source). */
  private genTransformerList(kind: "reroll" | "explode"): ListGen | null {
    const n = this.rng.int(1, 5);
    const body = this.genRepeatBody(1, EMPTY_ENV);
    if (!body.r) return null;
    const pred = this.genPredicate(body.dist, kind === "explode");
    const lenHi = kind === "explode" ? n * 6 : n;
    return {
      node: {
        kind: "call",
        name: kind,
        args: [
          { kind: "repeat", count: n, body: body.node },
          { kind: "closure", params: ["$x"], body: pred.node },
        ],
        trail: true,
      },
      ty: { k: "list", elem: intTy(body.r), lenLo: n, lenHi },
    };
  }

  /** Small dice source for transformers (N ≤ 5, M ≤ 12 — the transformer
   * carve-out bounds). `dist` is the distribution of the values the
   * transformer SEES: individual draws for `NdM` sources (the sum is
   * only the implicit top-level cast), so every source is uniform. */
  private genDiceSource(): {
    node: Node;
    n: number;
    elemRange: IntRange;
    dist: Dist;
  } {
    switch (this.rng.weighted([["die1", 15], ["die2", 40], ["range", 30], ["urange", 15]])) {
      case "die1": {
        const m = this.rng.int(2, 12);
        return {
          node: { kind: "die1", m },
          n: 1,
          elemRange: ir(1, m, true),
          dist: uniformDist(1, m),
        };
      }
      case "die2": {
        const n = this.rng.int(1, 5);
        const m = this.rng.int(2, 12);
        return {
          node: { kind: "die2", n, m },
          n,
          elemRange: ir(1, m, true),
          dist: uniformDist(1, m),
        };
      }
      case "range": {
        const r = drawRange(this.rng);
        return {
          node: { kind: "range", a: r.lo, b: r.hi },
          n: 1,
          elemRange: r,
          dist: uniformDist(r.lo, r.hi),
        };
      }
      default: {
        const m = this.rng.int(2, 12);
        return {
          node: { kind: "urange", m },
          n: 1,
          elemRange: ir(1, m, true),
          dist: uniformDist(1, m),
        };
      }
    }
  }

  // ---- captures -------------------------------------------------------------

  private genCaptureCall(depth: number, env: Env, c: C): IntGen | null {
    const op = this.rng.weighted([
      ["&+/2", 16],
      ["&-/2", 16],
      ["&*/2", 14],
      ["&**/2", 8],
      ["&^/2", 5],
      ["&%/2", 10],
      ["&~/2", 8],
      ["&d/1", 5],
      ["&d/2", 8],
      ["&-/1", 10],
    ]);
    const finish = (fn: string, arity: number, args: Node[], r: Range): IntGen | null =>
      fits(r, c)
        ? {
          node: {
            kind: "valueCall",
            callee: { kind: "capture", fn, arity },
            args,
          },
          r,
        }
        : null;
    switch (op) {
      case "&+/2":
      case "&-/2": {
        const a = this.genInt(dec(depth), env, c);
        const b = this.genInt(dec(depth), env, c);
        if (!a.r || !b.r) return null;
        return finish(
          op === "&+/2" ? "+" : "-",
          2,
          [a.node, b.node],
          op === "&+/2" ? rAdd(a.r, b.r) : rSub(a.r, b.r),
        );
      }
      case "&*/2": {
        const a = this.genInt(dec(depth), env, c);
        const b = this.genInt(dec(depth), env, c);
        if (!a.r || !b.r) return null;
        // `-0` avoidance, as for the `*` operator.
        const zeroA = a.r.lo === 0 && a.r.hi === 0;
        const zeroB = b.r.lo === 0 && b.r.hi === 0;
        if ((zeroA && b.r.lo < 0) || (zeroB && a.r.lo < 0)) return null;
        return finish("*", 2, [a.node, b.node], rMul(a.r, b.r));
      }
      case "&**/2":
      case "&^/2": {
        const k = this.rng.int(0, 6);
        const base = this.genInt(dec(depth), env, ANY);
        if (!base.r) return null;
        return finish(
          op === "&**/2" ? "**" : "^",
          2,
          [base.node, { kind: "int", v: k }],
          rPow(base.r, k),
        );
      }
      case "&%/2": {
        const a = this.genInt(dec(depth), env, { minLo: 0, maxHi: MAX_I32 });
        const d = this.genInt(dec(depth), env, { minLo: 1, maxHi: MAX_I32 });
        if (!a.r || !d.r) return null;
        return finish("%", 2, [a.node, d.node], rMod(a.r, d.r));
      }
      case "&~/2": {
        const rr = drawRange(this.rng);
        return finish("~", 2, [
          { kind: "int", v: rr.lo },
          { kind: "int", v: rr.hi },
        ], rr);
      }
      case "&d/1": {
        const m = this.rng.int(2, 12);
        return finish("d", 1, [{ kind: "int", v: m }], ir(1, m, true));
      }
      case "&d/2": {
        const n = this.rng.int(0, 8);
        const m = this.rng.int(2, 12);
        return finish(
          "d",
          2,
          [{ kind: "int", v: n }, { kind: "int", v: m }],
          ir(n, n * m, true),
        );
      }
      case "&-/1": {
        // Unary minus capture; `-0` avoidance as for `neg`.
        const a = this.genInt(dec(depth), env, { minLo: -c.maxHi, maxHi: -c.minLo });
        if (!a.r || (a.r.lo <= 0 && a.r.hi >= 0)) return null;
        return finish("-", 1, [a.node], rNeg(a.r));
      }
      default:
        return null;
    }
  }

  // ---- sketchy programs -------------------------------------------------------

  /** ~3% of programs deliberately trigger a runtime-error shape that both
   * implementations must report with the identical message. Every template
   * follows a verified/pinned error path from `test/differential.test.ts`. */
  private genSketchy(): Node {
    const t = this.rng.weighted([
      ["divZero", 18],
      ["modBadDivisor", 10],
      ["modNegDividend", 6],
      ["negExponent", 6],
      ["emptyHeadTail", 8],
      ["badElemReduce", 8],
      ["atOob", 10],
      ["wrongArityCall", 8],
      ["eqMismatch", 8],
      ["boolArith", 7],
      ["notInt", 4],
      ["listArith", 4],
      ["errorElem", 3],
      ["applyErr", 4],
      ["emptyV07", 5],
    ]);
    switch (t) {
      case "divZero":
        return {
          kind: "bin",
          op: "//",
          l: this.genInt(1, EMPTY_ENV, ANY).node,
          r: { kind: "int", v: 0 },
        };
      case "modBadDivisor": {
        const divisor = this.rng.chance(0.5)
          ? { kind: "int" as const, v: 0 }
          : {
            kind: "neg" as const,
            x: { kind: "int" as const, v: this.rng.int(1, 3) },
          };
        return {
          kind: "bin",
          op: "%",
          l: this.genInt(1, EMPTY_ENV, { minLo: 0, maxHi: MAX_I53 }).node,
          r: divisor,
        };
      }
      case "modNegDividend":
        return {
          kind: "bin",
          op: "%",
          l: { kind: "neg", x: { kind: "int", v: this.rng.int(1, 9) } },
          r: this.genInt(1, EMPTY_ENV, { minLo: 1, maxHi: 100 }).node,
        };
      case "negExponent":
        return {
          kind: "bin",
          op: "**",
          l: this.genInt(1, EMPTY_ENV, { minLo: 0, maxHi: 100 }).node,
          r: { kind: "neg", x: { kind: "int", v: this.rng.int(1, 3) } },
        };
      case "emptyHeadTail":
        return {
          kind: "call",
          name: this.rng.pick(["head", "tail"] as const),
          args: [{ kind: "listLit", xs: [] }],
        };
      case "badElemReduce": {
        const len = this.rng.int(1, 4);
        const xs: Node[] = [];
        for (let i = 0; i < len; i++) {
          xs.push({ kind: "int", v: this.rng.int(0, 9) });
        }
        const pos = this.rng.int(0, len - 1);
        xs.splice(pos, 0, { kind: "bool", v: this.rng.chance(0.5) });
        return {
          kind: "call",
          name: this.rng.pick(["sum", "product"] as const),
          args: [{ kind: "listLit", xs }],
        };
      }
      case "atOob": {
        const len = this.rng.int(1, 4);
        const xs: Node[] = [];
        for (let i = 0; i < len; i++) xs.push({ kind: "int", v: this.rng.int(0, 9) });
        // A negative index renders bare — only ever used in this delimited
        // argument position (verified `[1, 2] |> at(-1)`).
        const idx = this.rng.chance(0.3)
          ? { kind: "int" as const, v: this.rng.int(-3, -1) }
          : { kind: "int" as const, v: this.rng.int(len, len + 2) };
        return {
          kind: "call",
          name: "at",
          args: [{ kind: "listLit", xs }, idx],
        };
      }
      case "wrongArityCall": {
        const names = [this.freshName(), this.freshName()];
        const inner: Env = {
          vars: [...EMPTY_ENV.vars, ...names.map((name) => ({ name, ty: intTy(ir(0, 20, false)) }))],
        };
        const body = this.genInt(1, inner, ANY).node;
        return {
          kind: "valueCall",
          callee: { kind: "closure", params: names, body },
          args: [this.genInt(0, EMPTY_ENV, ANY).node],
        };
      }
      case "eqMismatch":
        return {
          kind: "cmp",
          op: this.rng.pick(["==", "!="] as const),
          l: this.genInt(1, EMPTY_ENV, ANY).node,
          r: { kind: "bool", v: this.rng.chance(0.5) },
        };
      case "boolArith": {
        const b = { kind: "bool" as const, v: this.rng.chance(0.5) };
        const i = this.genInt(1, EMPTY_ENV, ANY).node;
        return this.rng.chance(0.5)
          ? { kind: "bin", op: "+", l: i, r: b }
          : { kind: "bin", op: "+", l: b, r: i };
      }
      case "notInt":
        return { kind: "not", x: this.genInt(1, EMPTY_ENV, ANY).node };
      case "listArith": {
        const len = this.rng.int(1, 3);
        const xs: Node[] = [];
        for (let i = 0; i < len; i++) xs.push({ kind: "int", v: this.rng.int(0, 9) });
        return {
          kind: "bin",
          op: "+",
          l: { kind: "listLit", xs },
          r: { kind: "int", v: this.rng.int(1, 9) },
        };
      }
      case "errorElem": {
        // Erroring element inside a plain list feeding sum/sort (never
        // map/zipWith — compat #9 leaky trailing slots).
        const len = this.rng.int(1, 3);
        const xs: Node[] = [];
        for (let i = 0; i < len; i++) {
          xs.push({ kind: "int", v: this.rng.int(0, 9) });
        }
        const pos = this.rng.int(0, len - 1);
        xs.splice(pos, 0, {
          kind: "bin",
          op: "//",
          l: { kind: "int", v: this.rng.int(1, 9) },
          r: { kind: "int", v: 0 },
        });
        return {
          kind: "call",
          name: this.rng.pick(["sum", "sort"] as const),
          args: [{ kind: "listLit", xs }],
        };
      }
      case "applyErr": {
        // compat #9 (map/zipWith error beacon) — an apply whose argument
        // makes the closure body error at runtime (the body forces its
        // lazy arg). Kept top-level: inside a map/zipWith closure body
        // this shape is the beacon divergence, emitted only deliberately
        // (BEACON_DIVERGENT). Preserves the error-through-lazy-apply
        // coverage lost when apply args were constrained to their param
        // ranges; both impls report the identical runtime error, and the
        // message renders operand VALUES canonically (verified, e.g.
        // `1 // sum(filter([3, 4], |$e| $e > 100))` reports `1 // 0`), so
        // randomized source spacing cannot break message parity.
        const name = this.freshName();
        const varA = (): Node => ({ kind: "var", name });
        let body: Node;
        let arg: Node;
        switch (this.rng.int(0, 2)) {
          case 0:
            // `$a % ($a - $a)` — divisor 0 for any argument.
            body = {
              kind: "bin",
              op: "%",
              l: varA(),
              r: { kind: "bin", op: "-", l: varA(), r: varA() },
            };
            arg = { kind: "int", v: this.rng.int(1, 999) };
            break;
          case 1:
            // `$a // ($a - $a)` — divisor 0 for any argument.
            body = {
              kind: "bin",
              op: "//",
              l: varA(),
              r: { kind: "bin", op: "-", l: varA(), r: varA() },
            };
            arg = { kind: "int", v: this.rng.int(1, 999) };
            break;
          default:
            // `$a * $a` — argument² beyond ±(2^53−1) (k ≥ ⌈√MAX_I53⌉).
            body = { kind: "bin", op: "*", l: varA(), r: varA() };
            arg = { kind: "int", v: this.rng.int(94906266, 2000000000) };
            break;
        }
        return {
          kind: "valueCall",
          callee: { kind: "closure", params: [name], body },
          args: [arg],
        };
      }
      case "emptyV07":
        // v0.7 (nova/docs/v0.7-contracts.md): `min`/`max`/`last`/`init`
        // on `[]` error with key 44 列表为空 in both impls — same family
        // as head/tail. Kept off the normal path (error-freedom); the
        // error shape is pinned here instead.
        return {
          kind: "call",
          name: this.rng.pick(["min", "max", "last", "init"] as const),
          args: [{ kind: "listLit", xs: [] }],
        };
      default:
        return { kind: "bin", op: "//", l: { kind: "int", v: 1 }, r: { kind: "int", v: 0 } };
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /** Whole-program render: nested form or top-level pipe chain. */
  renderProgram(node: Node): string {
    // Collect the left spine of calls with ≥ 1 argument.
    const spine: (Extract<Node, { kind: "call" }> | Extract<Node, { kind: "valueCall" }>)[] = [];
    let cur: Node = node;
    while ((cur.kind === "call" || cur.kind === "valueCall") && cur.args.length >= 1) {
      spine.push(cur);
      cur = cur.args[0]!;
    }
    if (spine.length >= 2 && this.rng.chance(0.55)) {
      const parts = [this.opd(cur, BP.PIPE, "left")];
      // NB: the loop must reach i = 0 — the OUTERMOST call is spine[0].
      // It used to stop at i = 1, silently dropping the outermost call
      // (`sum(map(xs, f))` rendered as `xs |> map(f)`); dormant while no
      // outermost call was semantically load-bearing, but fatal once
      // take-bounded sequences appeared (dropping the `take` exposes the
      // bare infinite iterate at a cast position — found live as a naive
      // heap OOM / nova 内存不足 on `(…) |> iterate(|$a| $a + 4)`).
      for (let i = spine.length - 1; i >= 0; i--) {
        parts.push(this.renderChainCall(spine[i]!));
      }
      return parts.join(" |> ");
    }
    return this.renderFull(node, true);
  }

  /** A spine call minus its first argument, as a pipe-chain step. Closures
   * render inline here — a trailing closure mid-chain (`x |> f() |$a| …`)
   * is an unverified form and is excluded. */
  private renderChainCall(
    call: Extract<Node, { kind: "call" }> | Extract<Node, { kind: "valueCall" }>,
  ): string {
    const rest = call.args.slice(1);
    if (call.kind === "call") {
      if (rest.length === 0) return call.name; // `|> head` bare form
      return `${call.name}(${rest.map((a) => this.renderArg(a, false)).join(this.commaSep())})`;
    }
    const callee = call.callee;
    const calleeSrc = callee.kind === "closure"
      ? `(${this.render0(callee)})`
      : this.render0(callee);
    if (rest.length === 0) return `${calleeSrc}.()`;
    return `${calleeSrc}.(${rest.map((a) => this.renderArg(a, false)).join(this.commaSep())})`;
  }

  /** Nested render; `allowTrail` enables the trailing-closure form where
   * EOF (whole program) or an argument delimiter follows. */
  private renderFull(node: Node, allowTrail: boolean): string {
    if (allowTrail) {
      const t = this.maybeTrail(node);
      if (t !== null) return t;
    }
    return this.render0(node);
  }

  /** Trailing-closure form `f(a, …) |$x| body`, or null. */
  private maybeTrail(node: Node): string | null {
    if (
      node.kind === "call" && node.trail && node.args.length >= 2 &&
      node.args[node.args.length - 1]!.kind === "closure"
    ) {
      const rest = node.args.slice(0, -1);
      const closure = node.args[node.args.length - 1]!;
      return `${node.name}(${rest.map((a) => this.renderArg(a, true)).join(this.commaSep())}) ${this.render0(closure)}`;
    }
    return null;
  }

  /** Argument position (delimited by `,`/`)`) — trailing form allowed. */
  private renderArg(node: Node, allowTrail: boolean): string {
    if (allowTrail && this.rng.chance(0.25)) {
      const t = this.maybeTrail(node);
      if (t) return t;
    }
    return this.render0(node);
  }

  /** Render `node` as an operand: parenthesize per binding power. */
  private opd(node: Node, parentBp: number, side: "left" | "right"): string {
    const s = this.render0(node);
    const bp = nodeBp(node);
    const need = side === "left" ? bp < parentBp : bp <= parentBp;
    return need ? `(${s})` : s;
  }

  private opSpacing(): string {
    return this.rng.weighted([["", 40], [" ", 52], ["  ", 8]]);
  }

  private commaSep(): string {
    return this.rng.weighted([[",", 45], [", ", 55]]);
  }

  private litSource(v: number): string {
    if (v >= 1000 && v % 1000 === 0 && this.rng.chance(0.5)) {
      return `${v / 1000}_000`;
    }
    return `${v}`;
  }

  private render0(node: Node): string {
    switch (node.kind) {
      case "int":
        return this.litSource(node.v);
      case "bool":
        return node.v ? "true" : "false";
      case "var":
        return node.name;
      case "neg":
        return `(-${this.opd(node.x, BP.PREFIX, "right")})`;
      case "not":
        return `not ${this.opd(node.x, BP.PREFIX, "right")}`;
      case "bin": {
        const bp = bpOfBin(node.op);
        const l = this.opd(node.l, bp, "left");
        const r = this.opd(node.r, bp, "right");
        return `${l}${this.opSpacing()}${node.op}${this.opSpacing()}${r}`;
      }
      case "cmp": {
        const bp = node.op === "==" || node.op === "!=" ? BP.EQUAL : BP.COMPARE;
        const l = this.opd(node.l, bp, "left");
        const r = this.opd(node.r, bp, "right");
        return `${l}${this.opSpacing()}${node.op}${this.opSpacing()}${r}`;
      }
      case "die1":
        return `d${node.m}`;
      case "die2":
        return `${node.n}d${node.m}`;
      case "range":
        return `${node.a}${this.opSpacing()}~${this.opSpacing()}${node.b}`;
      case "urange":
        return `~${node.m}`;
      case "repeat": {
        const sep = this.rng.weighted([["", 55], [" ", 45]]);
        return `${node.count}${sep}#${sep}${this.opd(node.body, BP.REPEAT, "right")}`;
      }
      case "listLit":
        return `[${node.xs.map((x) => this.renderArg(x, false)).join(this.commaSep())}]`;
      case "call":
        return `${node.name}(${node.args.map((a) => this.renderArg(a, true)).join(this.commaSep())})`;
      case "valueCall":
        return `${this.renderCallee(node.callee)}.(${node.args.map((a) => this.renderArg(a, true)).join(this.commaSep())})`;
      case "capture":
        return `&${node.fn}/${node.arity}`;
      case "closure": {
        const params = node.params.join(this.commaSep());
        return `|${params}| ${this.renderFull(node.body, false)}`;
      }
    }
  }

  private renderCallee(callee: Node): string {
    if (callee.kind === "closure") return `(${this.render0(callee)})`;
    return this.render0(callee);
  }
}

// ---------------------------------------------------------------------------
// Deliberate beacon divergences (compat.md #9)
// ---------------------------------------------------------------------------

/**
 * A few FIXED beacon-divergent programs (compat.md #9): naive's map/zipWith
 * break-check materializes each element's error state into the list's error
 * beacon, so a non-forcing consumer (here: `count` with a predicate that
 * ignores its parameter) still errors in naive; nova's uniform laziness
 * returns ok. Erroring shapes: (a) the closure body itself errors (rows
 * 1–3), (b) the body forces an erroring INPUT element (rows 4–5) — per the
 * generator's avoidance rules these are impossible in the random stream
 * (normal-path map/zipWith applications are provably error-free), so they
 * are emitted deliberately here and asserted per-side by the fuzz suite
 * (`../fuzz.test.ts`). The final row is the boundary: an input element the
 * body never forces is NOT materialized — naive agrees with nova there
 * (the poison comes only from the closure application; verified live).
 * No dice inside, so the expectations are seed-independent; naive's error
 * messages render operand VALUES canonically (`1 // 0` →
 * `操作 “1 // 0” 非法：除数不能为零`), so they do not depend on spacing.
 * Pinned canonical shapes also live in test/differential.test.ts.
 */
export const BEACON_DIVERGENT: {
  source: string;
  naive: unknown;
  nova: unknown;
}[] = [
  {
    source: "count(map([0], |$d| 1 // 0), |$e| true)",
    naive: ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
    nova: ["ok", 1],
  },
  {
    source: "count(zipWith([0], [0], |$a, $b| 1 // 0), |$e| true)",
    naive: ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
    nova: ["ok", 1],
  },
  {
    source: "count(map([0, 0, 0], |$d| 1 // 0), |$e| true)",
    naive: ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
    nova: ["ok", 3],
  },
  {
    source: "count(map([1 // 0, 2], |$d| $d + 1), |$e| true)",
    naive: ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
    nova: ["ok", 2],
  },
  {
    source: "count(zipWith([1 // 0], [5], |$a, $b| $a + $b), |$e| true)",
    naive: ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
    nova: ["ok", 1],
  },
  {
    source: "count(map([1 // 0, 2], |$d| 7), |$e| true)",
    naive: ["ok", 2],
    nova: ["ok", 2],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate `count` programs deterministically from `masterSeed`
 * (one mulberry32 stream; program i depends only on the stream position,
 * so a given (seed, count, index) triple always reproduces the program). */
export function generatePrograms(
  masterSeed: number,
  count: number,
): GeneratedProgram[] {
  const gen = new ProgramGenerator(masterSeed);
  const out: GeneratedProgram[] = [];
  for (let i = 0; i < count; i++) {
    const { node, sketchy } = gen.genProgram();
    out.push({ index: i, source: gen.renderProgram(node), sketchy });
  }
  return out;
}
