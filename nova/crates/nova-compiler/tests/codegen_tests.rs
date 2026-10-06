//! Codegen tests: every emitted module is validated with `wasmparser`, plus
//! structural assertions (table size, exact import list, `__main` export).

use dicexp_nova_abi::{find_builtin, rt, RUNTIME_IMPORT_MODULE};
use dicexp_nova_compiler::compile_source;

struct ModuleInfo {
    imports: Vec<(String, String)>, // (module, name), functions + others
    memory_imports: Vec<(String, String, u64)>,
    table_import_min: Option<u64>,
    exports: Vec<String>,
    elem_func_count: usize,
    defined_func_count: usize,
}

fn compile(src: &str) -> (Vec<u8>, u32) {
    match compile_source(src) {
        Ok(ok) => (ok.wasm_bytes, ok.table_size),
        Err(es) => panic!("expected compile ok for {src:?}, got {es:?}"),
    }
}

fn inspect(bytes: &[u8]) -> ModuleInfo {
    use wasmparser::{Payload, TypeRef};
    let mut info = ModuleInfo {
        imports: Vec::new(),
        memory_imports: Vec::new(),
        table_import_min: None,
        exports: Vec::new(),
        elem_func_count: 0,
        defined_func_count: 0,
    };
    for payload in wasmparser::Parser::new(0).parse_all(bytes) {
        match payload.expect("payload") {
            Payload::ImportSection(reader) => {
                for imp in reader {
                    let wasmparser::Imports::Single(_, imp) = imp.expect("import") else {
                        panic!("unexpected compact imports");
                    };
                    match imp.ty {
                        TypeRef::Func(_) => {
                            info.imports.push((imp.module.to_string(), imp.name.to_string()))
                        }
                        TypeRef::Memory(m) => info
                            .memory_imports
                            .push((imp.module.to_string(), imp.name.to_string(), m.initial)),
                        TypeRef::Table(t) => {
                            info.table_import_min = Some(t.initial);
                            info.imports.push((imp.module.to_string(), imp.name.to_string()));
                        }
                        _ => {}
                    }
                }
            }
            Payload::ExportSection(reader) => {
                for e in reader {
                    let e = e.expect("export");
                    info.exports.push(e.name.to_string());
                }
            }
            Payload::ElementSection(reader) => {
                for seg in reader {
                    let seg = seg.expect("element segment");
                    if let wasmparser::ElementItems::Functions(f) = seg.items {
                        info.elem_func_count += f.count() as usize;
                    }
                }
            }
            Payload::FunctionSection(reader) => {
                info.defined_func_count = reader.count() as usize;
            }
            _ => {}
        }
    }
    info
}

fn validate(src: &str) -> (ModuleInfo, u32) {
    let (bytes, table_size) = compile(src);
    wasmparser::Validator::new()
        .validate_all(&bytes)
        .unwrap_or_else(|e| panic!("emitted module for {src:?} failed validation: {e}"));
    (inspect(&bytes), table_size)
}

fn fn_import_names(info: &ModuleInfo) -> Vec<&str> {
    info.imports
        .iter()
        .filter(|(m, _)| m == RUNTIME_IMPORT_MODULE)
        .map(|(_, n)| n.as_str())
        .collect()
}

// ---------------------------------------------------------------------------
// validation of a representative set of programs
// ---------------------------------------------------------------------------

#[test]
fn representative_programs_validate() {
    let programs = [
        "42",
        "true",
        "1 + 2",
        "2 * 3 - 4 // 5 % 6 ** 7 ^ 8",
        "not 1 == 2 and 3 < 4 or 5 >= 6",
        "d20",
        "3d6",
        "2d6 # 3",
        "~10",
        "1~10",
        "[1, 2, 3]",
        "[[1], [2, [3]]]",
        "[]",
        "sum([1, 2, 3])",
        "sort([3, 1]) |> head",
        "[1, 2] |> map(|$x| $x + 1) |> sum",
        "at([1, 2], 0)",
        "append([1], 2)",
        "zipWith([1], [2], |$x, $y| $x - $y)",
        "count([1, 2], |$x| $x > 1)",
        "filter([1, 2], |$x| $x > 1)",
        "zip([1], [2])",
        "any?([true])",
        "product([1, 2])",
        "tail([1, 2])",
        "reroll(d6, |$x| $x > 3)",
        "explode(d6, |$x| $x == 6)",
        "|$x| $x",
        "|| 1",
        "|_, $x| $x",
        "(|$x| $x + 1).(2)",
        "(&-/2).(10, 4)",
        "(&sum/1).([1, 2])",
        "(|$x| |$y| $x + $y).(1).(2)",
        "3 # d6",
        "2 # |$x| $x",
        "1.(2)", // runtime error, but compiles
        "sort([2, 1]) # 2 # 3",
        "1 |> sort",
        "10 |> &-/2.(20)",
    ];
    for p in programs {
        validate(p);
    }
}

// ---------------------------------------------------------------------------
// structural assertions
// ---------------------------------------------------------------------------

#[test]
fn structure_trivial_literal() {
    let (info, table_size) = validate("42");
    assert_eq!(table_size, 0);
    assert_eq!(info.table_import_min, Some(0));
    assert_eq!(info.elem_func_count, 0);
    assert!(fn_import_names(&info).is_empty());
    assert_eq!(info.memory_imports, vec![("env".to_string(), "memory".to_string(), 1)]);
    assert!(info.exports.iter().any(|e| e == "__main"));
    assert_eq!(info.defined_func_count, 1); // just __main
}

#[test]
fn structure_simple_call() {
    // `1 + 2`: both args are immediates → no thunk, no table entries. The
    // call site itself imports the checkpoint (plan §3.9).
    let (info, table_size) = validate("1 + 2");
    assert_eq!(table_size, 0);
    assert_eq!(fn_import_names(&info), vec![rt::CHECKPOINT, "op_add_2"]);
}

#[test]
fn structure_thunk_and_table() {
    // `[1 + 2]`: the element is a call → one thunk in the table (slot 0).
    let (info, table_size) = validate("[1 + 2]");
    assert_eq!(table_size, 1);
    assert_eq!(info.table_import_min, Some(1));
    assert_eq!(info.elem_func_count, 1);
    assert_eq!(
        fn_import_names(&info),
        vec![rt::THUNK_NEW, rt::LIST_NEW, rt::CHECKPOINT, "op_add_2"]
    );
}

#[test]
fn structure_exact_builtin_imports() {
    let (info, _) = validate("sort([3, 1 + 2]) |> head");
    assert_eq!(
        fn_import_names(&info),
        vec![
            rt::THUNK_NEW,
            rt::LIST_NEW,
            rt::CHECKPOINT,
            "bf_head_1",
            "bf_sort_1",
            "op_add_2"
        ]
    );
}

#[test]
fn structure_closure() {
    // `|$x| $x + 1`: closure body in the table; imports closure_new + env_new
    // (prologue) + op_add_2 (checkpointed as a regular call); the arg `1` is
    // an immediate.
    let (info, table_size) = validate("|$x| $x + 1");
    assert_eq!(table_size, 1);
    assert_eq!(
        fn_import_names(&info),
        vec![rt::CLOSURE_NEW, rt::ENV_NEW, rt::CHECKPOINT, "op_add_2"]
    );
}

#[test]
fn structure_value_call() {
    let (info, table_size) = validate("( |$x| $x ).(1 + 2)");
    // table: closure body + thunk for `1 + 2`
    assert_eq!(table_size, 2);
    assert_eq!(
        fn_import_names(&info),
        vec![
            rt::THUNK_NEW,
            rt::FORCE,
            rt::CLOSURE_NEW,
            rt::ENV_NEW,
            rt::ARGS_BUF,
            rt::CALL_CALLABLE,
            rt::CHECKPOINT,
            "op_add_2",
        ]
    );
}

#[test]
fn structure_repetition() {
    // `3 # d6`: count is an immediate; the body closure calls op_d_1
    // directly (its argument is an immediate), so the table holds just the
    // repetition body closure. The `d6` call site imports the checkpoint;
    // the `#` itself does not (plan §3.9).
    let (info, table_size) = validate("3 # d6");
    assert_eq!(table_size, 1);
    assert_eq!(
        fn_import_names(&info),
        vec![rt::CLOSURE_NEW, rt::ENV_NEW, rt::REPEAT, rt::CHECKPOINT, "op_d_1"]
    );
}

#[test]
fn structure_capture() {
    let (info, _) = validate("&-/2");
    assert_eq!(fn_import_names(&info), vec![rt::CAPTURE_NEW]);
}

#[test]
fn structure_alias_resolves_to_same_import() {
    // `^` is an alias of `**`: both import op_pow_2 (imported once). The
    // nested `**` arg is a call and gets a thunk.
    let (info, _) = validate("2 ^ 3 ** 4");
    assert_eq!(fn_import_names(&info), vec![rt::THUNK_NEW, rt::CHECKPOINT, "op_pow_2"]);
    assert!(find_builtin("^", 2).unwrap().import_name == "op_pow_2");
    // `2 ^ 3` alone needs no thunk at all.
    let (info, _) = validate("2 ^ 3");
    assert_eq!(fn_import_names(&info), vec![rt::CHECKPOINT, "op_pow_2"]);
}

#[test]
fn structure_nested_closures_lexical_addressing() {
    // two closure bodies + thunk for the outer value-call arg
    let (info, table_size) = validate("(|$x| |$y| $x + $y).(1).(2)");
    assert_eq!(table_size, 2); // outer + inner closure bodies (args are immediates)
    assert!(fn_import_names(&info).contains(&rt::CLOSURE_NEW));
    assert!(fn_import_names(&info).contains(&"op_add_2"));
}

#[test]
fn oversized_value_call_uses_env_buffer() {
    // argc > ARGS_BUF_SLOTS (64): args_buf must NOT be imported; env_new is
    // used for the arg buffer instead.
    let args: Vec<String> = (0..70).map(|i| i.to_string()).collect();
    let src = format!("&sum/1.({})", args.join(", "));
    let (info, _) = validate(&src);
    let names = fn_import_names(&info);
    assert!(names.contains(&rt::ENV_NEW));
    assert!(!names.contains(&rt::ARGS_BUF));
}

#[test]
fn memory_and_table_are_first_imports() {
    let (info, _) = validate("sum([1])");
    // memory is tracked separately in `memory_imports`; the `imports` list
    // starts with the table, followed by function imports.
    assert_eq!(info.memory_imports, vec![("env".to_string(), "memory".to_string(), 1)]);
    assert_eq!(info.imports[0], ("env".to_string(), "table".to_string()));
    assert_eq!(info.imports[1].0, RUNTIME_IMPORT_MODULE);
}

// ---------------------------------------------------------------------------
// checkpoint placement (plan §3.9)
// ---------------------------------------------------------------------------

#[test]
fn structure_checkpoint_only_at_call_sites() {
    // Regular calls and value calls are checkpointed; `#`/repetition is not
    // a call in naive and gets no checkpoint of its own (its body's own call
    // sites still do, see `structure_repetition`).
    let (info, _) = validate("3 # 1"); // count and body are immediates
    assert_eq!(
        fn_import_names(&info),
        vec![rt::CLOSURE_NEW, rt::ENV_NEW, rt::REPEAT]
    );

    // A value call is checkpointed (after the callee force).
    let (info, _) = validate("1.(2)"); // runtime error, but compiles
    assert!(fn_import_names(&info).contains(&rt::CHECKPOINT));

    // No call sites at all → no checkpoint import (inert when unarmed).
    for p in ["42", "true", "[1, [2]]", "&sum/1", "|$x| $x"] {
        let (info, _) = validate(p);
        assert!(
            !fn_import_names(&info).contains(&rt::CHECKPOINT),
            "{p:?} must not import the checkpoint"
        );
    }
}
