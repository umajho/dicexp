//! Codegen tests: every emitted module is validated with `wasmparser`, plus
//! structural assertions (table size, exact import list, `__main` export).

use dicexp_nova_abi::{find_builtin, rt, RUNTIME_IMPORT_MODULE};
use dicexp_nova_compiler::compile_source;
use wasmparser::{Payload, TypeRef};

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

// ---------------------------------------------------------------------------
// const pool (plan §3.4)
// ---------------------------------------------------------------------------

/// Compile + validate, returning the module bytes (for deep inspection).
fn compile_valid(src: &str) -> Vec<u8> {
    let (bytes, _) = compile(src);
    wasmparser::Validator::new()
        .validate_all(&bytes)
        .unwrap_or_else(|e| panic!("emitted module for {src:?} failed validation: {e}"));
    bytes
}

/// (val type, mutability) of every global in the module.
fn globals(bytes: &[u8]) -> Vec<(wasmparser::ValType, bool)> {
    let mut out = Vec::new();
    for payload in wasmparser::Parser::new(0).parse_all(bytes) {
        if let Payload::GlobalSection(reader) = payload.expect("payload") {
            for g in reader {
                let g = g.expect("global");
                out.push((g.ty.content_type, g.ty.mutable));
            }
        }
    }
    out
}

/// Function index of a runtime import, by name (function index space:
/// only `TypeRef::Func` imports count — memory/table don't).
fn rt_fn_index(bytes: &[u8], name: &str) -> u32 {
    let mut idx = 0u32;
    for payload in wasmparser::Parser::new(0).parse_all(bytes) {
        if let Payload::ImportSection(reader) = payload.expect("payload") {
            for imp in reader {
                let wasmparser::Imports::Single(_, imp) = imp.expect("import") else {
                    panic!("unexpected compact imports");
                };
                if let TypeRef::Func(_) = imp.ty {
                    if imp.module == RUNTIME_IMPORT_MODULE && imp.name == name {
                        return idx;
                    }
                    idx += 1;
                }
            }
        }
    }
    panic!("function import {name} not found");
}

/// Operator sequences of all DEFINED functions, in code-section order.
fn all_ops(bytes: &[u8]) -> Vec<Vec<wasmparser::Operator<'_>>> {
    let mut out = Vec::new();
    for payload in wasmparser::Parser::new(0).parse_all(bytes) {
        if let Payload::CodeSectionEntry(body) = payload.expect("payload") {
            let mut ops = Vec::new();
            let mut r = body.get_operators_reader().expect("operators");
            while !r.eof() {
                ops.push(r.read().expect("operator"));
            }
            out.push(ops);
        }
    }
    out
}

/// Operators of `__main` — always the LAST defined function (the codegen
/// pushes it after every `$clo` function emitted while walking the root).
fn main_ops(bytes: &[u8]) -> Vec<wasmparser::Operator<'_>> {
    all_ops(bytes).pop().expect("at least one defined function")
}

fn count_global_set(ops: &[wasmparser::Operator]) -> usize {
    ops.iter().filter(|o| matches!(o, wasmparser::Operator::GlobalSet { .. })).count()
}

fn count_global_get(ops: &[wasmparser::Operator], g: u32) -> usize {
    ops.iter()
        .filter(
            |o| matches!(o, wasmparser::Operator::GlobalGet { global_index } if *global_index == g),
        )
        .count()
}

fn count_global_get_any(ops: &[wasmparser::Operator]) -> usize {
    ops.iter().filter(|o| matches!(o, wasmparser::Operator::GlobalGet { .. })).count()
}

fn count_call(ops: &[wasmparser::Operator], f: u32) -> usize {
    ops.iter()
        .filter(|o| matches!(o, wasmparser::Operator::Call { function_index } if *function_index == f))
        .count()
}

/// Inner-first invariant: every `global.get` in the sequence happens only
/// after that global's `global.set` (prologue) — i.e. no code observes an
/// uninitialized pool global.
fn assert_init_before_use(ops: &[wasmparser::Operator]) {
    let mut initialized = std::collections::HashSet::new();
    for o in ops {
        match o {
            wasmparser::Operator::GlobalSet { global_index } => {
                initialized.insert(*global_index);
            }
            wasmparser::Operator::GlobalGet { global_index } => {
                assert!(
                    initialized.contains(global_index),
                    "global.get {global_index} before its prologue initialization"
                );
            }
            _ => {}
        }
    }
}

#[test]
fn const_pool_hoists_literal_list() {
    // `sum([1, 2, 3])`: the list is hoisted — one mutable i64 global,
    // initialized by a prologue in `__main`, read by a `global.get` at the
    // (single) occurrence.
    let bytes = compile_valid("sum([1, 2, 3])");
    assert_eq!(globals(&bytes), vec![(wasmparser::ValType::I64, true)]);
    let ops = main_ops(&bytes);
    assert_eq!(count_call(&ops, rt_fn_index(&bytes, rt::LIST_NEW)), 1);
    assert_eq!(count_global_set(&ops), 1);
    assert_eq!(count_global_get(&ops, 0), 1); // the occurrence (no nested lists)
    // Hoisting adds no table functions and no new imports.
    let (_, table_size) = compile("sum([1, 2, 3])");
    assert_eq!(table_size, 0);
    let (info, _) = validate("sum([1, 2, 3])");
    assert!(fn_import_names(&info).contains(&rt::LIST_NEW));
}

#[test]
fn const_pool_dedups_structurally_identical_lists() {
    // Two occurrences of `[1, 2]` → ONE global; the occurrences live inside
    // the two arg thunks, so counts aggregate over all functions.
    let bytes = compile_valid("at([1, 2], 0) + at([1, 2], 1)");
    assert_eq!(globals(&bytes).len(), 1);
    let all = all_ops(&bytes);
    let gets: usize = all.iter().map(|o| count_global_get(o, 0)).sum();
    assert_eq!(gets, 2); // one per occurrence
    let sets: usize = all.iter().map(|o| count_global_set(o)).sum();
    assert_eq!(sets, 1);
    let allocations: usize =
        all.iter().map(|o| count_call(o, rt_fn_index(&bytes, rt::LIST_NEW))).sum();
    assert_eq!(allocations, 1); // only the prologue allocation
}

#[test]
fn const_pool_nested_lists_inner_first() {
    // `[[1], [2, [3]]]` → 4 globals: [1], [3], [2,[3]], [[1],[2,[3]]].
    let bytes = compile_valid("[[1], [2, [3]]]");
    assert_eq!(globals(&bytes), vec![(wasmparser::ValType::I64, true); 4]);
    let ops = main_ops(&bytes);
    assert_eq!(count_call(&ops, rt_fn_index(&bytes, rt::LIST_NEW)), 4);
    assert_eq!(count_global_set(&ops), 4);
    // Prologue reads of child globals: [2,[3]] reads [3]; the outer reads
    // [1] and [2,[3]] → 3 gets, plus 1 occurrence get = 4 total in __main.
    assert_eq!(count_global_get_any(&ops), 4);
    assert_init_before_use(&ops);
}

#[test]
fn const_pool_skips_non_literal_lists() {
    // Call / closure / capture elements disqualify a list; scalars are not
    // hoisted either (already inline i64 consts).
    for p in ["[1 + 2]", "[|$x| $x]", "[&sum/1]", "42", "true"] {
        assert_eq!(globals(&compile_valid(p)).len(), 0, "{p:?} must not hoist");
    }
    // `[1 + 2]` stays fully inline: one list_new call in __main, no sets.
    let bytes = compile_valid("[1 + 2]");
    let ops = main_ops(&bytes);
    assert_eq!(count_global_set(&ops), 0);
    assert_eq!(count_call(&ops, rt_fn_index(&bytes, rt::LIST_NEW)), 1);

    // Mixed: the inner `[3, 4]` hoists, the outer list stays inline.
    let bytes = compile_valid("[1 + 2, [3, 4]]");
    assert_eq!(globals(&bytes).len(), 1);
    let all = all_ops(&bytes);
    let sets: usize = all.iter().map(|o| count_global_set(o)).sum();
    assert_eq!(sets, 1);
    let gets: usize = all.iter().map(|o| count_global_get(o, 0)).sum();
    assert_eq!(gets, 1); // the outer list's element store
    let allocations: usize =
        all.iter().map(|o| count_call(o, rt_fn_index(&bytes, rt::LIST_NEW))).sum();
    assert_eq!(allocations, 2); // prologue + inline outer construction

    // No lists at all → no list_new import (unchanged behavior).
    let (info, _) = validate("42");
    assert!(!fn_import_names(&info).contains(&rt::LIST_NEW));
}

#[test]
fn const_pool_hoists_empty_list() {
    // `[]` hoists for uniformity — and a program whose ONLY list is hoisted
    // still imports list_new (the prologue uses it), nothing else runtime.
    let bytes = compile_valid("[]");
    assert_eq!(globals(&bytes), vec![(wasmparser::ValType::I64, true)]);
    let ops = main_ops(&bytes);
    assert_eq!(count_call(&ops, rt_fn_index(&bytes, rt::LIST_NEW)), 1);
    assert_eq!(count_global_set(&ops), 1);
    assert_eq!(count_global_get_any(&ops), 1);
    let (info, table_size) = validate("[]");
    assert_eq!(table_size, 0);
    assert_eq!(fn_import_names(&info), vec![rt::LIST_NEW]);
}

#[test]
fn const_pool_occurrences_in_closure_and_repetition_bodies() {
    // Occurrences compile to `global.get` from ANY function — the prologue
    // in `__main` has run before any thunk/closure body can execute.
    let bytes = compile_valid("map([1], |$x| [2])");
    assert_eq!(globals(&bytes).len(), 2);
    let all = all_ops(&bytes);
    let gets: usize = all.iter().map(|o| count_global_get_any(o)).sum();
    assert_eq!(gets, 2); // one per occurrence
    let sets: usize = all.iter().map(|o| count_global_set(o)).sum();
    assert_eq!(sets, 2);

    let bytes = compile_valid("2 # [1, 2]");
    assert_eq!(globals(&bytes).len(), 1);
    let all = all_ops(&bytes);
    let gets: usize = all.iter().map(|o| count_global_get_any(o)).sum();
    assert_eq!(gets, 1); // occurrence in the repetition body closure
    let sets: usize = all.iter().map(|o| count_global_set(o)).sum();
    assert_eq!(sets, 1);
}

// ---------------------------------------------------------------------------
// measurement-only `checkpoints = off` build (plan §3.9)
// ---------------------------------------------------------------------------

// These run only under `cargo test -p dicexp-nova-compiler
// --no-default-features` (the configuration `just build-nova-wasm-nockpt`
// ships): the compiler must emit NO checkpoint guards and omit the
// CHECKPOINT import — nothing else changes.
//
// NOTE: the sibling structure tests above hard-assert checkpoint-ON import
// lists and are only meaningful under the DEFAULT feature set — this
// measurement-only configuration intentionally leaves them failing (it is
// not a supported configuration; only the emitted wasm artifact is used).
#[cfg(not(feature = "checkpoints"))]
#[test]
fn nockpts_feature_off_emits_no_checkpoint_import() {
    for p in ["1 + 2", "1.(2)", "sum([1])", "3 # d6"] {
        let (info, _) = validate(p);
        let names = fn_import_names(&info);
        assert!(!names.contains(&rt::CHECKPOINT), "{p:?} must not import the checkpoint");
        // Everything else is unchanged: the builtins still get imported.
        match p {
            "1 + 2" => assert_eq!(names, vec!["op_add_2"]),
            "sum([1])" => assert_eq!(names, vec![rt::LIST_NEW, "bf_sum_1"]),
            "3 # d6" => assert!(names.contains(&"op_d_1")),
            _ => {}
        }
    }
}
