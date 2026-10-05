//! Generates `nova-shim.wasm`: a tiny module that lets the builtins module
//! call compiled closures via `call_indirect` on the shared funcref table.
//!
//! Rust (rustc/LLVM) cannot declare table imports, so the builtins module
//! imports `env.call_closure` as a regular function; this shim implements it
//! as a `call_indirect` through the JS-created table it imports as
//! `env.table`. Program modules (emitted by dicexp-nova-compiler, where we
//! control every byte) import the same table directly and need no shim.
//!
//! Equivalent WAT:
//!
//! ```wat
//! (module
//!   (type $clo (func (param i32 i32 i32) (result i64)))
//!   (import "env" "table" (table 0 funcref))
//!   (func (export "call_closure")
//!         (param $fnidx i32) (param $env i32) (param $args i32) (param $argc i32)
//!         (result i64)
//!     local.get $env
//!     local.get $args
//!     local.get $argc
//!     local.get $fnidx
//!     call_indirect (type $clo) (table 0)))
//! ```

use std::io::Write;

use wasm_encoder::{
    CodeSection, EntityType, ExportKind, ExportSection, Function, FunctionSection,
    ImportSection, Instruction, Module, RefType, TableType, TypeSection, ValType,
};

fn main() {
    let mut module = Module::new();

    let mut types = TypeSection::new();
    types.ty().function(
        [ValType::I32, ValType::I32, ValType::I32],
        [ValType::I64],
    );
    module.section(&types);

    let mut imports = ImportSection::new();
    imports.import(
        "env",
        "table",
        EntityType::Table(TableType {
            element_type: RefType::FUNCREF,
            minimum: 0,
            maximum: None,
            table64: false,
            shared: false,
        }),
    );
    module.section(&imports);

    let mut funcs = FunctionSection::new();
    funcs.function(0);
    module.section(&funcs);

    let mut exports = ExportSection::new();
    exports.export("call_closure", ExportKind::Func, 0);
    module.section(&exports);

    let mut code = CodeSection::new();
    let mut f = Function::new([]);
    // Push (env, args, argc) then the function index and call indirectly.
    f.instruction(&Instruction::LocalGet(1));
    f.instruction(&Instruction::LocalGet(2));
    f.instruction(&Instruction::LocalGet(3));
    f.instruction(&Instruction::LocalGet(0));
    f.instruction(&Instruction::CallIndirect { type_index: 0, table_index: 0 });
    f.instruction(&Instruction::End);
    code.function(&f);
    module.section(&code);

    let bytes = module.finish();
    std::io::stdout().write_all(&bytes).expect("write shim wasm to stdout");
}
