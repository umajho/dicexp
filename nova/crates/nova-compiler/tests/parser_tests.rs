//! Parser conformance tests, ported from
//! `packages/naive-evaluator/test/parsing/parse.test.ts` (the behavior oracle).

use dicexp_nova_compiler::ast::{CallStyle, Node, Value, ValueCallStyle};
use dicexp_nova_compiler::error::CompileError;
use dicexp_nova_compiler::parse_source;
use dicexp_nova_abi::error_key;

/// Render an AST as a canonical S-expression (spans excluded) for equality
/// comparison. Mirrors naive's node shapes (incl. `style`).
fn render(node: &Node) -> String {
    match node {
        Node::Variable(name, _) => name.clone(),
        Node::RegularCall { style, name, args, .. } => {
            let style = match style {
                CallStyle::Function => "function",
                CallStyle::Operator => "operator",
                CallStyle::Piped => "piped",
            };
            let inner: Vec<String> = args.iter().map(render).collect();
            format!("(call/{style} {name}{})", render_args(&inner))
        }
        Node::ValueCall { style, variable, args, .. } => {
            let style = match style {
                ValueCallStyle::Function => "function",
                ValueCallStyle::Piped => "piped",
            };
            let inner: Vec<String> = args.iter().map(render).collect();
            format!("(vcall/{style} {}{})", render(variable), render_args(&inner))
        }
        Node::Repetition { count, body, .. } => {
            format!("(repetition {} {})", render(count), render(body))
        }
        Node::Value(v, _) => match v {
            Value::Integer(n) => format!("{n}"),
            Value::Boolean(b) => format!("{b}"),
            Value::List(items) => {
                let inner: Vec<String> = items.iter().map(render).collect();
                format!("(list{})", render_args(&inner))
            }
            Value::Closure { params, body } => {
                let ps: Vec<String> = params.iter().map(|(n, _)| n.clone()).collect();
                format!("(closure |{}| {})", ps.join(" "), render(body))
            }
            Value::Captured { identifier, arity } => {
                format!("(captured {identifier} {arity})")
            }
        },
    }
}

fn render_args(args: &[String]) -> String {
    if args.is_empty() {
        String::new()
    } else {
        format!(" {}", args.join(" "))
    }
}

fn ok(src: &str) -> Node {
    match parse_source(src) {
        Ok(n) => n,
        Err(es) => panic!("expected ok for {src:?}, got {es:?}"),
    }
}

fn eq(src: &str, expected: &str) {
    let node = ok(src);
    assert_eq!(render(&node), expected, "for source {src:?}");
}

/// `src` parses to the same AST as `expected_src` parses.
fn equiv(src: &str, expected_src: &str) {
    assert_eq!(render(&ok(src)), render(&ok(expected_src)), "for {src:?} ≡ {expected_src:?}");
}

fn bad(src: &str) -> Vec<CompileError> {
    match parse_source(src) {
        Ok(n) => panic!("expected error for {src:?}, got {}", render(&n)),
        Err(es) => es,
    }
}

fn bad_with(src: &str, key: u32) {
    let es = bad(src);
    assert!(es.iter().any(|e| e.key == key), "expected key {key} for {src:?}, got {es:?}");
}

// ---------------------------------------------------------------------------
// 空白
// ---------------------------------------------------------------------------

#[test]
fn whitespace_does_not_affect_parsing() {
    for (a, b) in [
        ("1 + 1", "1+1"),
        ("1+ 1", "1+1"),
        (" 1 +1", "1+1"),
        (" 1 ", "1"),
        ("foo ( bar , baz )", "foo(bar,baz)"),
        ("foo ( | $bar , $baz | $qux )", "foo(|$bar,$baz|$qux)"),
        ("f (1)", "f(1)"),
        ("[ 1 , 2 ]", "[1,2]"),
        ("3 d 4", "3d4"),
        ("d 4", "d4"),
    ] {
        equiv(a, b);
    }
}

// ---------------------------------------------------------------------------
// 全角/半角
// ---------------------------------------------------------------------------

#[test]
fn full_width_is_normalized() {
    equiv(
        "foo（1＋1） ／／ bar （｜ ｜ 1）",
        r"foo(1+1) // bar (| | 1)",
    );
    equiv("１２３", "123");
    equiv("３ｄ４", "3d4");
}

// ---------------------------------------------------------------------------
// 整数常量
// ---------------------------------------------------------------------------

#[test]
fn integer_literals() {
    eq("1", "1");
    eq("1_000_000", "1000000");
    bad("1_");
    bad("1__1");
    // 可以跟在 `d` 之后
    eq("d1_1", "(call/operator d 11)");
}

#[test]
fn integer_safe_range() {
    eq("9007199254740991", "9007199254740991");
    eq("-9007199254740991", "(call/operator - 9007199254740991)");
    bad_with("9007199254740992", error_key::PARSE_INTEGER_LITERAL_TOO_LARGE);
    bad_with("-9007199254740992", error_key::PARSE_INTEGER_LITERAL_TOO_LARGE);
    bad_with("99999999999999999999999999", error_key::PARSE_INTEGER_LITERAL_TOO_LARGE);
    // the param is the stripped literal (naive's badIntegerLiteral behavior)
    let es = bad("9_007_199_254_740_992");
    assert_eq!(es[0].key, error_key::PARSE_INTEGER_LITERAL_TOO_LARGE);
}

// ---------------------------------------------------------------------------
// 掷骰的操作数
// ---------------------------------------------------------------------------

#[test]
fn dice_operands() {
    for src in ["d4", "3d4", "-3d4", "2+3d4*5"] {
        ok(src);
    }
    // 并非纯粹数字常量的操作数需要用括号围住
    ok("3d(+4)");
    bad("3d+4");
    eq("3d(+4)", "(call/operator d 3 4)");
    eq("d(+4)", "(call/operator d 4)");
    eq("3d(-4)", "(call/operator d 3 -4)");
    eq("d(-4)", "(call/operator d -4)");
    eq("d(4+5)", "(call/operator d (call/operator + 4 5))");
    // 连用需要用括号确定优先级
    ok("(d4)d4");
    eq("d4d4", "d4d4"); // 视为名为 “d4d4” 的标识符
    ok("3d(4d5)");
    bad("3d4d5");
    // the #12 regression
    eq("(d1_000_000_000)", "(call/operator d 1000000000)");
    // `d%` was removed from the grammar
    bad("d%");
    // lhs restricted to Grouping | LiteralInteger
    bad("x d4");
    ok("(d4)d4");
    bad("3d4 d5");
}

// ---------------------------------------------------------------------------
// 优先级 (ported table: strip parens ⇒ same AST)
// ---------------------------------------------------------------------------

#[test]
fn precedence_table() {
    let mut table: Vec<String> = Vec::new();
    for exp_op in ["**", "^"] {
        for s in [
            format!("(3d4){exp_op}(5d6)"),
            format!("(d4){exp_op}(5d6)"),
            format!("(not true) {exp_op} true"),
            format!("3*(4{exp_op}5)//(6{exp_op}7)%8"),
        ] {
            table.push(s);
        }
    }
    table.extend(
        [
            "(((3*4)//5)%6)",
            "(((6%5)//4)*3)",
            "(-3*2)",
            "(+3//2)",
            "(-3)-2",
            "(+3)+2",
            "(1+2)-3",
            "(1-2)+3",
            "(1+2)~(3-4)",
            "(~3)~(~2)",
            "(1~2)#(3~4)",
            "(1#2)|>three",
            "(1|>two)<(3|>four)",
            "(((1<2)>3)<=4)>=5",
            "(((1>=2)<=3)>4)<5",
            "(1<2)==(3<4)",
            "(1==2)!=3",
            "(1!=2)==3",
            "(1==2) and (3==4)",
            "(1 and 2) or (3 and 4)",
        ]
        .iter()
        .map(|s| s.to_string()),
    );
    for x in table {
        let stripped: String = x.chars().filter(|c| *c != '(' && *c != ')').collect();
        equiv(&stripped, &x);
    }
}

#[test]
fn precedence_misc() {
    // `^/2` parses with the name `^` (alias resolution happens later).
    eq("2^3", "(call/operator ^ 2 3)");
    eq("2**3", "(call/operator ** 2 3)");
    // prefix ops chain right regardless of relative precedence
    eq("-~3", "(call/operator - (call/operator ~ 3))");
    eq("~-3", "(call/operator ~ (call/operator - 3))");
    eq("not ~true", "(call/operator not (call/operator ~ true))");
    eq("~ not true", "(call/operator ~ (call/operator not true))");
    eq("-d4", "(call/operator - (call/operator d 4))");
    eq("not d4", "(call/operator not (call/operator d 4))");
    eq("~- 3", "(call/operator ~ (call/operator - 3))");
    eq("-3~4", "(call/operator ~ (call/operator - 3) 4)");
    eq("~3+4", "(call/operator ~ (call/operator + 3 4))");
    eq("-3**2", "(call/operator ** (call/operator - 3) 2)");
    eq("not 3 ** 2", "(call/operator ** (call/operator not 3) 2)");
    eq("2d6#3", "(repetition (call/operator d 2 6) 3)");
    eq("2 # 3 + 4", "(repetition 2 (call/operator + 3 4))");
    eq("1#2#3", "(repetition (repetition 1 2) 3)");
}

// ---------------------------------------------------------------------------
// 标识符
// ---------------------------------------------------------------------------

#[test]
fn identifier_prefixes() {
    for p in ["$", "@", "@@", "@_"] {
        bad(p);
        bad(&format!("{p}foo()"));
        ok(&format!("{p}foo.()"));
    }
    bad("_");
    bad("$_");
    bad("@_");
    eq("$x", "$x");
    eq("@x", "@x");
    eq("@@x", "@@x");
    eq("@_x", "@_x");
}

#[test]
fn identifier_names() {
    for name in ["foo", "foo?", "_a1"] {
        eq(name, name);
        eq(&format!("{name}()"), &format!("(call/function {name})"));
    }
    for name in ["foo!", "1a"] {
        bad(name);
        bad(&format!("{name}()"));
    }
}

#[test]
fn keyword_fragments_inside_identifiers() {
    let fragments = ["d", "d1", "not", "or", "true"];
    let mut conditions: Vec<String> = Vec::new();
    for c in &fragments {
        // `d` 后面不能一直是数字，但其他可以是
        let is_d_digits = c.starts_with('d') && c[1..].chars().all(|x| x.is_ascii_digit());
        if !is_d_digits {
            conditions.push(format!("{c}1"));
        }
        for x in ["a", "_"] {
            conditions.push(format!("{c}{x}"));
            conditions.push(format!("{x}{c}"));
            conditions.push(format!("{x}{c}{x}"));
        }
        conditions.push(format!("{c}or{c}"));
        conditions.push(format!("not{c}"));
        conditions.push(format!("{c}{c}"));
    }
    for cond in conditions {
        eq(&cond, &cond);
        eq(&format!("{cond}()"), &format!("(call/function {cond})"));
    }
}

#[test]
fn closure_parameter_names() {
    bad("|x| 1");
    bad("|@x| 1");
    bad("|_x| 1");
    eq("|$x| 1", "(closure |$x| 1)");
    eq("|_| 1", "(closure |_| 1)");
    eq("|| 1", "(closure || 1)");
    eq("|$x,$y| $x", "(closure |$x $y| $x)");
    bad("|$x,| $x");
}

#[test]
fn unicode_identifiers() {
    ok(r"(|$参数| 函数($参数)).(甲#乙d丙)");
    eq("参数", "参数");
}

// ---------------------------------------------------------------------------
// 捕获
// ---------------------------------------------------------------------------

#[test]
fn captures() {
    eq("&and/2", "(captured and 2)");
    eq("&or/2", "(captured or 2)");
    eq("&not/1", "(captured not 1)");
    eq("&foo?/1", "(captured foo? 1)");
    eq("&d/1", "(captured d 1)");
    eq("&d/2", "(captured d 2)");
    eq("&*/2", "(captured * 2)");
    eq("&**/2", "(captured ** 2)");
    eq("&^/2", "(captured ^ 2)");
}

#[test]
fn capture_no_whitespace_inside() {
    bad("& + /2");
    bad("&+/ 2");
    bad("&// /2");
}

#[test]
fn capture_operators_all_accepted() {
    // [DEVIATION] naive rejects &</2, &<=/2, &>/2, &>=/2, &==/2 due to a
    // Lezer tokenization quirk; nova accepts them per the grammar's intent.
    for op in ["<", "<=", ">", ">=", "==", "!=", "+", "-", "*", "**", "^", "//", "%", "~"] {
        eq(&format!("&{op}/2"), &format!("(captured {op} 2)"));
    }
    eq("&~/1", "(captured ~ 1)");
    // `#` and `|>` are NOT capturable
    bad("&#/2");
    bad("&|>/2");
    bad("&&x/1");
    bad("&$x/1");
    bad("&true/1");
    bad("&d%/1");
    eq("&foo/1_0", "(captured foo 10)");
    bad_with("&foo/99999999999999999999", error_key::PARSE_INTEGER_LITERAL_TOO_LARGE);
}

// ---------------------------------------------------------------------------
// 管道运算符 (pipe desugaring, ported table)
// ---------------------------------------------------------------------------

#[test]
fn pipe_desugaring() {
    // unary function
    eq("[2, 3, 1] |> sort", "(call/piped sort (list 2 3 1))");
    eq("[2, 3, 1] |> sort()", "(call/piped sort (list 2 3 1))");
    // multi-arg function
    eq("[2, 3, 1] |> append(4)", "(call/piped append (list 2 3 1) 4)");
    // closure shorthand
    eq(
        r"[2, 3, 1] |> map (|$x| $x**2)",
        "(call/piped map (list 2 3 1) (closure |$x| (call/operator ** $x 2)))",
    );
    // value call
    eq(
        r"10 |> (|$x| $x*2).()",
        "(vcall/piped (closure |$x| (call/operator * $x 2)) 10)",
    );
    eq(
        r"10 |> (|$x, $y| $x*2).(20)",
        "(vcall/piped (closure |$x $y| (call/operator * $x 2)) 10 20)",
    );
    // captures
    eq("10 |> &-/1.()", "(vcall/piped (captured - 1) 10)");
    eq("10 |> &-/2.(20)", "(vcall/piped (captured - 2) 10 20)");
    // chained
    eq(
        "[1] |> map(|$x| $x) |> sum",
        "(call/piped sum (call/piped map (list 1) (closure |$x| $x)))",
    );
    eq("a |> b |> c", "(call/piped c (call/piped b a))");
    eq("1 |> $f", "(call/piped $f 1)");
    eq("1 |> $f.(2)", "(vcall/piped $f 1 2)");
}

#[test]
fn pipe_bad_targets() {
    for src in ["1 |> 2", "1 |> [2]", "1 |> 2+3", "1 |> (b |> c)", "1 |> 2 |> 3"] {
        bad_with(src, error_key::PARSE_BAD_PIPE_TARGET);
    }
    // `1 |> not` is a plain syntax error in naive too (grammar-level ⚠)
    bad_with("1 |> not", error_key::PARSE_SYNTAX_ERROR);
}

// ---------------------------------------------------------------------------
// trailing closures
// ---------------------------------------------------------------------------

#[test]
fn trailing_closure_forms() {
    eq(
        "f(1) |$x| $x + 1",
        "(call/function f 1 (closure |$x| (call/operator + $x 1)))",
    );
    eq("f |$x| $x", "(call/function f (closure |$x| $x))");
    eq("f(1) |$x| $x |> g", "(call/piped g (call/function f 1 (closure |$x| $x)))");
    eq(
        "map([1], |$x| $x) |$x| $x",
        "(call/function map (list 1) (closure |$x| $x) (closure |$x| $x))",
    );
    eq(
        "f |$a| g |$b| 1",
        "(call/function f (closure |$a| (call/function g (closure |$b| 1))))",
    );
    // closures in argument lists
    eq("foo(|$x| $x, 1)", "(call/function foo (closure |$x| $x) 1)");
    eq("[| $x| $x]", "(list (closure |$x| $x))");
    // value calls do NOT take trailing closures
    bad("f.(1) |$x| $x");
}

// ---------------------------------------------------------------------------
// value calls
// ---------------------------------------------------------------------------

#[test]
fn value_calls() {
    eq("a.()", "(vcall/function a)");
    eq("1.(2)", "(vcall/function 1 2)");
    eq("f.(1).(2)", "(vcall/function (vcall/function f 1) 2)");
    bad("a.b()");
    bad("f.(1)(2)");
    eq("@x.()", "(vcall/function @x)");
    eq("$f.()", "(vcall/function $f)");
}

// ---------------------------------------------------------------------------
// closure bodies exclude pipes
// ---------------------------------------------------------------------------

#[test]
fn closure_body_excludes_pipe() {
    eq("|$x| $x |> f", "(call/piped f (closure |$x| $x))");
    eq(
        "|$x| ($x |> f)",
        "(closure |$x| (call/piped f $x))",
    );
}

#[test]
fn closure_body_includes_operators_looser_than_pipe() {
    // expressionWithoutPipe still includes compare/equal/and/or (which are
    // LOOSER than |>): they belong to the closure body, not outside it.
    eq("|$x| $x > 1", "(closure |$x| (call/operator > $x 1))");
    eq("|$x| $x % 2 == 0", "(closure |$x| (call/operator == (call/operator % $x 2) 0))");
    eq("|$x| $x and true", "(closure |$x| (call/operator and $x true))");
    eq("|$x| $x or false", "(closure |$x| (call/operator or $x false))");
    eq("|$x| $x # 2", "(closure |$x| (repetition $x 2))");
    eq("map([1,2,3], |$x| $x > 1)", "(call/function map (list 1 2 3) (closure |$x| (call/operator > $x 1)))");
    // but a pipe still terminates the body — even in operand position
    // (verified against naive: `expressionWithoutPipe` is parameterized
    // recursively, so pipes are excluded at every level inside the body)
    eq(
        "map([1], |$x| $x) |> sum",
        "(call/piped sum (call/function map (list 1) (closure |$x| $x)))",
    );
    eq(
        "f |$x| $x > 1 |> g",
        "(call/piped g (call/function f (closure |$x| (call/operator > $x 1))))",
    );
    eq(
        "f |$x| $x and 1 |> g",
        "(call/piped g (call/function f (closure |$x| (call/operator and $x 1))))",
    );
    eq(
        "|$x| $x == 1 |> g",
        "(call/piped g (closure |$x| (call/operator == $x 1)))",
    );
    // …while a grouping re-enables pipes inside the body
    eq(
        "|$x| $x > (1 |> g)",
        "(closure |$x| (call/operator > $x (call/piped g 1)))",
    );
    eq(
        "|$x| f($x |> g)",
        "(closure |$x| (call/function f (call/piped g $x)))",
    );
}

// ---------------------------------------------------------------------------
// repetition
// ---------------------------------------------------------------------------

#[test]
fn repetition() {
    eq("3 # d6", "(repetition 3 (call/operator d 6))");
    eq("1#|$x| $x", "(repetition 1 (closure |$x| $x))");
    eq("(d4)#(d5)", "(repetition (call/operator d 4) (call/operator d 5))");
}

// ---------------------------------------------------------------------------
// misc syntax errors
// ---------------------------------------------------------------------------

#[test]
fn slash_suggests_div() {
    bad_with("5/3", error_key::PARSE_SLASH_SUGGEST_DIV);
    bad_with("5 / 3", error_key::PARSE_SLASH_SUGGEST_DIV);
    bad_with("1 / 2 / 3", error_key::PARSE_SLASH_SUGGEST_DIV);
    ok("5//3");
}

#[test]
fn generic_syntax_errors() {
    for src in [
        "", "()", "(1,2)", "[1,2,]", "1 , 2", "foo??", "1 |>", "d", "not", "and", "and(1,2)",
        "true(1)", "$foo()", "f(1)(2)", "sum |[1]| 1", "d?",
    ] {
        bad(src);
    }
}

#[test]
fn spans_are_char_indices() {
    // "甲" is one char: spans count Unicode scalars, not bytes/UTF-16 units.
    let es = bad("甲 +");
    assert_eq!(es[0].key, error_key::PARSE_SYNTAX_ERROR);
    assert_eq!(es[0].span, (3, 3)); // EOF position in chars
}

#[test]
fn eof_syntax_error_spans() {
    // EOF-triggered syntax errors carry the empty span at the end-of-input
    // position (in chars, i.e. past trailing whitespace) — the same range
    // naive's Lezer ⚠ occupies at EOF. The zh locale renders it with
    // naive's convention (`自列 len 至列 len` + preceding-char excerpt), so
    // these spans are part of the observable message parity.
    for (src, span) in [
        ("", (0, 0)),
        ("1+", (2, 2)),
        ("d", (1, 1)),
        ("3#", (2, 2)),
        ("map(", (4, 4)),
        ("[1,", (3, 3)),
        ("d(", (2, 2)),
        ("|$x|", (4, 4)),
        ("1~", (2, 2)),
        ("&", (1, 1)),
        ("(", (1, 1)),
        ("2 |>", (4, 4)),
        ("1 **", (4, 4)),
        ("not", (3, 3)), // EOF position, not the token start
        ("1+  ", (4, 4)), // past trailing whitespace
        ("１＋", (2, 2)), // normalized-source coords (1:1 per char)
    ] {
        let es = bad(src);
        assert_eq!(es[0].key, error_key::PARSE_SYNTAX_ERROR, "for {src:?}");
        assert_eq!(es[0].span, span, "for {src:?}");
    }
}

#[test]
fn mid_input_syntax_error_spans() {
    // Mid-input errors carry the offending token's span — nova's own
    // convention (compat.md #10: naive's Lezer recovery ⚠s are skip-regions
    // that only sometimes coincide with the offending token).
    for (src, span) in [
        ("d-", (1, 2)), // `-` cannot start a dice operand
        ("1+2)", (3, 4)), // trailing junk after a complete expression
        ("1 1", (2, 3)),
        ("1?", (1, 2)),
        ("1 ;", (2, 3)),
        ("&/", (1, 2)),
    ] {
        let es = bad(src);
        assert_eq!(es[0].key, error_key::PARSE_SYNTAX_ERROR, "for {src:?}");
        assert_eq!(es[0].span, span, "for {src:?}");
    }
}

#[test]
fn grouping_is_transparent() {
    eq("(((1)))", "1");
    eq("(d4)", "(call/operator d 4)");
}
