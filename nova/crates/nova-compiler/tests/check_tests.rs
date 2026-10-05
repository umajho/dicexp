//! Compile-time semantic error tests (compat.md item 3: unknown identifiers
//! / functions are compile-time errors in nova).

use dicexp_nova_compiler::error::{CompileError, ErrParam};
use dicexp_nova_compiler::{compile_source, parse_source};
use dicexp_nova_abi::error_key;

fn errors(src: &str) -> Vec<CompileError> {
    match compile_source(src) {
        Ok(_) => panic!("expected compile errors for {src:?}"),
        Err(es) => es,
    }
}

fn assert_ok(src: &str) {
    if let Err(es) = compile_source(src) {
        panic!("expected ok for {src:?}, got {es:?}");
    }
}

fn one(src: &str, key: u32, params: Vec<ErrParam>, span: (u32, u32)) {
    let es = errors(src);
    assert_eq!(es.len(), 1, "for {src:?}: {es:?}");
    assert_eq!(es[0].key, key, "for {src:?}");
    assert_eq!(es[0].params, params, "for {src:?}");
    assert_eq!(es[0].span, span, "for {src:?}");
}

fn s(p: &str) -> ErrParam {
    ErrParam::Str(p.to_string())
}

// ---------------------------------------------------------------------------
// unknown regular functions (1000)
// ---------------------------------------------------------------------------

#[test]
fn unknown_regular_function() {
    one("foo(1)", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/1")], (0, 3));
    one("foo", error_key::UNKNOWN_VARIABLE, vec![s("foo")], (0, 3));
    one("foo()", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/0")], (0, 3));
    one("foo(1, 2)", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/2")], (0, 3));
    // trailing closure counts towards the arity
    one("f(1) |$x| $x", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("f/2")], (0, 1));
    one("f |$x| $x", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("f/1")], (0, 1));
    // piped calls check name/arity with the piped argument prepended
    one("1 |> foo", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/1")], (5, 8));
    one("1 |> foo(2)", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/2")], (5, 8));
    // builtin with wrong arity
    one("sum(1, 2)", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("sum/2")], (0, 3));
    one("sort([1]) |> foo", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/1")], (13, 16));
}

#[test]
fn unknown_captured_function() {
    one("&foo/1", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/1")], (0, 6));
    one("&sum/2", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("sum/2")], (0, 6));
    one("&d/3", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("d/3")], (0, 4));
    one("&foo/1_0", error_key::UNKNOWN_REGULAR_FUNCTION, vec![s("foo/10")], (0, 8));
}

#[test]
fn known_functions_are_ok() {
    assert_ok("sum([1, 2])");
    assert_ok("1 |> sort");
    assert_ok("[1] |> map(|$x| $x)");
    assert_ok("sort([1]) |> head");
    assert_ok("zipWith([1], [2], |$x, $y| $x + $y)");
    assert_ok("&sum/1");
    assert_ok("&^/2"); // alias of `**/2`
    assert_ok("&d/2");
    assert_ok("1 + 2 * 3 // 4 % 5 ** 6 ^ 7");
    assert_ok("1 == 2 != 3 < 4 > 5 <= 6 >= 7 and true or not false");
    assert_ok("d20 + 3d6 ~ 4");
    assert_ok("count([1], |$x| $x)");
}

// ---------------------------------------------------------------------------
// unknown variables (1001)
// ---------------------------------------------------------------------------

#[test]
fn unknown_variables() {
    one("$x", error_key::UNKNOWN_VARIABLE, vec![s("$x")], (0, 2));
    one("foo", error_key::UNKNOWN_VARIABLE, vec![s("foo")], (0, 3));
    one("@x", error_key::UNKNOWN_VARIABLE, vec![s("@x")], (0, 2));
    one("@@x", error_key::UNKNOWN_VARIABLE, vec![s("@@x")], (0, 3));
    one("@_x", error_key::UNKNOWN_VARIABLE, vec![s("@_x")], (0, 3));
    // even builtin names are not variables (naive: unknownVariable)
    one("sort", error_key::UNKNOWN_VARIABLE, vec![s("sort")], (0, 4));
    one("_x", error_key::UNKNOWN_VARIABLE, vec![s("_x")], (0, 2));
    // unbound inside closures
    one("|$x| $y", error_key::UNKNOWN_VARIABLE, vec![s("$y")], (5, 7));
    // span points at the variable, unicode-safe (char indices)
    one("甲", error_key::UNKNOWN_VARIABLE, vec![s("甲")], (0, 1));
}

#[test]
fn lexical_scoping() {
    assert_ok("|$x| $x");
    assert_ok("|$x| |$y| $x + $y");
    assert_ok("(|$x| |$y| $x + $y).(1).(2)");
    // shadowing
    assert_ok("|$x| |$x| $x");
    // `_` params are ignored (and `_` is not a variable)
    assert_ok("|_| 1");
    assert_ok("|_, _| 1");
    assert_ok("|_, $x| $x");
    // variables are resolvable inside nested lists/calls/thunks
    assert_ok("|$x| [$x, $x + 1, sum([$x])]");
    assert_ok("|$x| $x # $x");
}

// ---------------------------------------------------------------------------
// duplicate closure parameter names (1002)
// ---------------------------------------------------------------------------

#[test]
fn duplicate_closure_parameters() {
    one("|$x,$x| 1", error_key::DUPLICATE_CLOSURE_PARAMETER_NAMES, vec![s("$x")], (4, 6));
    let es = errors("|$x,$y,$x| 1");
    assert_eq!(es.len(), 1);
    assert_eq!(es[0].key, error_key::DUPLICATE_CLOSURE_PARAMETER_NAMES);
    assert_eq!(es[0].params, vec![s("$x")]);
    assert_eq!(es[0].span, (7, 9));
    // `_` is repeatable
    assert_ok("|_,_| 1");
    // distinct names ok
    assert_ok("|$x,$y| $x");
    // same name in different closures is fine (shadowing)
    assert_ok("|$x| |$x| $x");
}

// ---------------------------------------------------------------------------
// multiple errors are collected (not just the first)
// ---------------------------------------------------------------------------

#[test]
fn collects_all_errors() {
    let es = errors("foo(bar, $x)");
    assert_eq!(
        es.iter().map(|e| e.key).collect::<Vec<_>>(),
        vec![
            error_key::UNKNOWN_REGULAR_FUNCTION, // foo/2
            error_key::UNKNOWN_VARIABLE,         // bar
            error_key::UNKNOWN_VARIABLE,         // $x
        ]
    );
    assert_eq!(es[0].params, vec![s("foo/2")]);
    assert_eq!(es[1].params, vec![s("bar")]);
    assert_eq!(es[2].params, vec![s("$x")]);
    assert_eq!(es[1].span, (4, 7));
    assert_eq!(es[2].span, (9, 11));

    let es = errors("[foo, &bar/1, |$x,$x| $y]");
    assert_eq!(
        es.iter().map(|e| e.key).collect::<Vec<_>>(),
        vec![
            error_key::UNKNOWN_VARIABLE,                    // foo
            error_key::UNKNOWN_REGULAR_FUNCTION,            // bar/1
            error_key::DUPLICATE_CLOSURE_PARAMETER_NAMES,   // $x
            error_key::UNKNOWN_VARIABLE,                    // $y
        ]
    );

    // unknown calls still get their args checked
    let es = errors("foo(bar(1))");
    assert_eq!(
        es.iter().map(|e| e.key).collect::<Vec<_>>(),
        vec![error_key::UNKNOWN_REGULAR_FUNCTION, error_key::UNKNOWN_REGULAR_FUNCTION]
    );
    assert_eq!(es[0].params, vec![s("foo/1")]);
    assert_eq!(es[1].params, vec![s("bar/1")]);
}

// ---------------------------------------------------------------------------
// NOT compile errors
// ---------------------------------------------------------------------------

#[test]
fn not_compile_errors() {
    // value call of a known non-callable literal: runtime VALUE_IS_NOT_CALLABLE
    assert_ok("1.(2)");
    assert_ok("true.()");
    assert_ok("[1].(1)");
    assert_ok("3d6.(1)");
}

// ---------------------------------------------------------------------------
// parse errors short-circuit the semantic checks
// ---------------------------------------------------------------------------

#[test]
fn parse_errors_come_first() {
    let es = errors("foo(1,)");
    assert_eq!(es.len(), 1);
    assert_eq!(es[0].key, error_key::PARSE_SYNTAX_ERROR);
}

// the checks are the same entry as compile_source's error path
#[test]
fn check_matches_compile_source() {
    let node = parse_source("foo($x)").unwrap();
    let via_check = dicexp_nova_compiler::check::check(&node);
    let via_compile = errors("foo($x)");
    assert_eq!(via_check, via_compile);
}
