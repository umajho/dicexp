//! Dev tool: dump a pseudo-WAT rendering of the emitted module for review.
//! Usage: `cargo run -p dicexp-nova-compiler --example dump -- '3 # d6'`

use dicexp_nova_compiler::compile_source;

fn main() {
    let src = std::env::args().nth(1).expect("usage: dump <source>");
    let ok = match compile_source(&src) {
        Ok(ok) => ok,
        Err(es) => {
            eprintln!("compile errors: {es:?}");
            std::process::exit(1);
        }
    };
    println!(";; table_size = {}", ok.table_size);
    dump(&ok.wasm_bytes);
}

fn dump(bytes: &[u8]) {
    use wasmparser::Payload;
    let mut fn_idx = 0u32;
    let mut import_fn_count = 0u32;
    for payload in wasmparser::Parser::new(0).parse_all(bytes) {
        match payload.unwrap() {
            Payload::TypeSection(r) => {
                for (i, ty) in r.into_iter().enumerate() {
                    let ty = ty.unwrap();
                    let subs: Vec<String> = ty
                        .types()
                        .filter_map(|sub| {
                            if let wasmparser::CompositeInnerType::Func(ft) =
                                &sub.composite_type.inner
                            {
                                Some(fmt_func_type(ft))
                            } else {
                                None
                            }
                        })
                        .collect();
                    for s in subs {
                        println!("(type {i} {s})");
                    }
                }
            }
            Payload::ImportSection(r) => {
                for imp in r {
                    let wasmparser::Imports::Single(_, imp) = imp.unwrap() else { continue };
                    match imp.ty {
                        wasmparser::TypeRef::Func(t) => {
                            println!("(import \"{}\" \"{}\" (func {} (type {t})))", imp.module, imp.name, fn_idx);
                            fn_idx += 1;
                            import_fn_count += 1;
                        }
                        wasmparser::TypeRef::Memory(m) => {
                            println!("(import \"{}\" \"{}\" (memory {}))", imp.module, imp.name, m.initial);
                        }
                        wasmparser::TypeRef::Table(t) => {
                            println!("(import \"{}\" \"{}\" (table {} funcref))", imp.module, imp.name, t.initial);
                        }
                        _ => {}
                    }
                }
            }
            Payload::FunctionSection(r) => {
                for ty in r {
                    println!("(func {} (type {})) ;; defined", fn_idx, ty.unwrap());
                    fn_idx += 1;
                }
            }
            Payload::ExportSection(r) => {
                for e in r {
                    let e = e.unwrap();
                    println!("(export \"{}\" {:?} {})", e.name, e.kind, e.index);
                }
            }
            Payload::ElementSection(r) => {
                for seg in r {
                    let seg = seg.unwrap();
                    if let wasmparser::ElementItems::Functions(f) = seg.items {
                        let idxs: Vec<u32> = f.into_iter().map(|x| x.unwrap()).collect();
                        println!("(elem (i32.const 0) func {idxs:?})");
                    }
                }
            }
            Payload::CodeSectionEntry(body) => {
                let locals: Vec<(u32, wasmparser::ValType)> =
                    body.get_locals_reader().unwrap().into_iter().map(|l| l.unwrap()).collect();
                println!(";; --- function body (locals {locals:?}) ---");
                for op in body.get_operators_reader().unwrap() {
                    println!("  {}", fmt_op(&op.unwrap()));
                }
            }
            _ => {}
        }
    }
    let _ = import_fn_count;
}

fn fmt_func_type(ty: &wasmparser::FuncType) -> String {
    format!(
        "(func (param {}) (result {}))",
        ty.params().iter().map(fmt_valtype).collect::<Vec<_>>().join(" "),
        ty.results().iter().map(fmt_valtype).collect::<Vec<_>>().join(" ")
    )
}

fn fmt_valtype(t: &wasmparser::ValType) -> &'static str {
    match t {
        wasmparser::ValType::I32 => "i32",
        wasmparser::ValType::I64 => "i64",
        _ => "?",
    }
}

fn fmt_op(op: &wasmparser::Operator) -> String {
    use wasmparser::Operator as O;
    match op {
        O::I32Const { value } => format!("i32.const {value}"),
        O::I64Const { value } => format!("i64.const {value}"),
        O::LocalGet { local_index } => format!("local.get {local_index}"),
        O::LocalSet { local_index } => format!("local.set {local_index}"),
        O::Call { function_index } => format!("call {function_index}"),
        O::I32Load { memarg } => format!("i32.load offset={}", memarg.offset),
        O::I64Load { memarg } => format!("i64.load offset={}", memarg.offset),
        O::I64Store { memarg } => format!("i64.store offset={}", memarg.offset),
        O::I64ExtendI32U => "i64.extend_i32_u".into(),
        O::I64Shl => "i64.shl".into(),
        O::I64Or => "i64.or".into(),
        O::End => "end".into(),
        other => format!("{other:?}"),
    }
}
