//! Emulated linear memory + bump allocator.
//!
//! Value handles address heap objects by *byte offset* (see `nova-abi`), so all
//! heap access goes through this module. On `wasm32` the offsets ARE raw
//! pointers into linear memory (base = 0) and growth uses `memory.grow`; the
//! 256 MiB cap is enforced by the engine (linker `--max-memory`). On native
//! targets we emulate linear memory with a malloc'd buffer so `cargo test` can
//! exercise the exact same code paths.
//!
//! Everything here is `thread_local`, which gives native tests isolation
//! (libtest runs each test on its own thread) and is a plain static on wasm.
//!
//! A small *permanent zone* is allocated once at init, before the bump floor:
//! the preallocated OOM error object, an emergency result region, the shared
//! args buffer and a scratch sink. `reset()` rewinds the bump pointer to the
//! floor, so permanent objects survive across evaluations.

use std::cell::Cell;

#[cfg(target_arch = "wasm32")]
use core::arch::wasm32::{memory_grow, memory_size};

#[cfg(target_arch = "wasm32")]
extern "C" {
    /// Linker-provided start of the heap (right after .data/.bss).
    static __heap_base: u8;
}

/// Hard memory limit (mirrors the 256 MiB engine limit on wasm). Kept as
/// state (not a const) so native tests can shrink it to exercise OOM paths.
const DEFAULT_LIMIT: usize = 256 * 1024 * 1024;

const PAGE: usize = 64 * 1024;

thread_local! {
    static INITIALIZED: Cell<bool> = const { Cell::new(false) };
    /// Base of the emulated memory (always 0 on wasm: offsets are pointers).
    static BASE: Cell<*mut u8> = const { Cell::new(core::ptr::null_mut()) };
    /// Current size of the (emulated) linear memory in bytes.
    static SIZE: Cell<usize> = const { Cell::new(0) };
    /// Bump pointer: first unallocated offset.
    static USED: Cell<usize> = const { Cell::new(0) };
    /// Offset the bump pointer rewinds to on `reset()` (end of permanent zone).
    static FLOOR: Cell<usize> = const { Cell::new(0) };
    static LIMIT: Cell<usize> = const { Cell::new(DEFAULT_LIMIT) };
    /// Offsets of permanent-zone blocks (filled at init).
    static PERM_OOM_ERROR: Cell<u32> = const { Cell::new(0) };
    static PERM_OOM_PARAMS: Cell<u32> = const { Cell::new(0) };
    static PERM_EMERGENCY: Cell<u32> = const { Cell::new(0) };
    static PERM_ARGS_BUF: Cell<u32> = const { Cell::new(0) };
    static PERM_SINK: Cell<u32> = const { Cell::new(0) };
}

/// Size of the emergency result region (must hold the longest static error
/// encoding: 0x03 + key + count = 9 bytes; 64 is generous).
pub(crate) const EMERGENCY_REGION_SIZE: usize = 64;
/// Size of the scratch sink returned by `env_new`/`list_new` on OOM (their
/// i32 return type has no error channel; writes land here harmlessly).
const SINK_SIZE: usize = 16 + 64 * 8;

#[inline]
pub(crate) fn ptr(off: u32) -> *mut u8 {
    BASE.with(|b| unsafe { b.get().add(off as usize) })
}

/// Allocate `size` bytes (8-aligned) from the bump region.
/// Returns `None` when memory cannot be grown (limit reached).
pub(crate) fn halloc(size: usize) -> Option<u32> {
    halloc_align(size, 8)
}

pub(crate) fn halloc_align(size: usize, align: usize) -> Option<u32> {
    ensure_init();
    debug_assert!(align.is_power_of_two());
    let used = USED.with(Cell::get);
    let aligned = (used + align - 1) & !(align - 1);
    let end = aligned.checked_add(size)?;
    if end > SIZE.with(Cell::get) && !grow_to_fit(end) {
        return None;
    }
    USED.with(|u| u.set(end));
    Some(aligned as u32)
}

/// Rewind the bump pointer to the permanent floor (per-evaluation reset).
pub(crate) fn rewind() {
    ensure_init();
    USED.with(|u| u.set(FLOOR.with(Cell::get)));
}

pub(crate) fn oom_error_offset() -> u32 {
    ensure_init();
    PERM_OOM_ERROR.with(Cell::get)
}
pub(crate) fn emergency_offset() -> u32 {
    ensure_init();
    PERM_EMERGENCY.with(Cell::get)
}
pub(crate) fn args_buf_offset() -> u32 {
    ensure_init();
    PERM_ARGS_BUF.with(Cell::get)
}
pub(crate) fn sink_offset() -> u32 {
    ensure_init();
    PERM_SINK.with(Cell::get)
}

/// Test-only: override the memory limit (native; on wasm the engine enforces
/// its own cap on top of this).
#[cfg(not(target_arch = "wasm32"))]
pub fn set_limit_for_test(bytes: usize) {
    LIMIT.with(|l| l.set(bytes));
}

#[cfg(not(target_arch = "wasm32"))]
pub fn reset_limit_for_test() {
    LIMIT.with(|l| l.set(DEFAULT_LIMIT));
}

/// Current bump offset (used by tests to gauge allocation).
#[cfg(not(target_arch = "wasm32"))]
pub fn used_for_test() -> usize {
    ensure_init();
    USED.with(Cell::get)
}

// ---------------------------------------------------------------------------
// init / grow
// ---------------------------------------------------------------------------

pub(crate) fn ensure_init() {
    if INITIALIZED.with(Cell::get) {
        return;
    }
    init_platform();
    // Reserve offsets 0..8 so that offset 0 is never a valid object
    // (0 doubles as "no parent" for ENV and "no params" conventions).
    // Invariant: the whole permanent zone (~1.1 KiB) always fits in the
    // initial memory (≥ 1 page = 64 KiB), so these can never fail.
    halloc_raw(8).expect("first allocation must succeed");

    // Permanent zone (see module docs). Layout sizes mirror values.rs.
    let oom_error = halloc_raw(16).expect("permanent zone must fit");
    let oom_params = halloc_raw(8).expect("permanent zone must fit");
    let emergency = halloc_raw(EMERGENCY_REGION_SIZE).expect("permanent zone");
    let args_buf = halloc_raw(64 * 8).expect("permanent zone");
    let sink = halloc_raw(SINK_SIZE).expect("permanent zone");
    PERM_OOM_ERROR.with(|c| c.set(oom_error));
    PERM_OOM_PARAMS.with(|c| c.set(oom_params));
    PERM_EMERGENCY.with(|c| c.set(emergency));
    PERM_ARGS_BUF.with(|c| c.set(args_buf));
    PERM_SINK.with(|c| c.set(sink));

    // Initialize the preallocated OOM error object:
    // header { kind: u8, flags: u8, _reserved: u16, len: u32 } then
    // payload { key: u32, params: u32 }.
    write_u8(oom_error, 0, crate::values::HDR_KIND_ERROR);
    write_u32(oom_error, 8, dicexp_nova_abi::error_key::MEMORY_LIMIT_EXCEEDED);
    write_u32(oom_error, 12, oom_params);
    write_u32(oom_params, 0, 0); // param count = 0

    // Initialize the emergency result region with the wire encoding of the
    // MEMORY_LIMIT_EXCEEDED error: 0x03 u32le(key) u32le(count=0).
    write_u8(emergency, 0, 0x03);
    write_u32(emergency, 1, dicexp_nova_abi::error_key::MEMORY_LIMIT_EXCEEDED);
    write_u32(emergency, 5, 0);

    FLOOR.with(|f| f.set(USED.with(Cell::get)));
    INITIALIZED.with(|i| i.set(true));
}

/// Raw bump allocation without init recursion (init uses it).
fn halloc_raw(size: usize) -> Option<u32> {
    let used = USED.with(Cell::get);
    let aligned = (used + 7) & !7;
    let end = aligned.checked_add(size)?;
    if end > SIZE.with(Cell::get) && !grow_to_fit(end) {
        return None;
    }
    USED.with(|u| u.set(end));
    Some(aligned as u32)
}

fn grow_to_fit(end: usize) -> bool {
    if end > LIMIT.with(Cell::get) {
        return false;
    }
    platform_grow(end)
}

// ---------------------------------------------------------------------------
// platform backends
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
fn init_platform() {
    let base = unsafe { &__heap_base as *const u8 as usize };
    BASE.with(|b| b.set(core::ptr::null_mut()));
    USED.with(|u| u.set(base));
    SIZE.with(|s| s.set(memory_size(0) * PAGE));
}

#[cfg(target_arch = "wasm32")]
fn platform_grow(end: usize) -> bool {
    let mut size = SIZE.with(Cell::get);
    while end > size {
        let add = ((end - size) + PAGE - 1) / PAGE;
        if memory_grow(0, add) == usize::MAX {
            return false;
        }
        size += add * PAGE;
    }
    SIZE.with(|s| s.set(size));
    true
}

#[cfg(not(target_arch = "wasm32"))]
fn init_platform() {
    let layout = std::alloc::Layout::from_size_align(PAGE, 8).expect("layout");
    let buf = unsafe { std::alloc::alloc(layout) };
    assert!(!buf.is_null(), "native emulated memory allocation failed");
    BASE.with(|b| b.set(buf));
    SIZE.with(|s| s.set(PAGE));
    USED.with(|u| u.set(0));
}

#[cfg(not(target_arch = "wasm32"))]
fn platform_grow(end: usize) -> bool {
    let mut new_size = SIZE.with(Cell::get);
    while end > new_size {
        new_size = match new_size.checked_mul(2) {
            Some(n) => n,
            None => return false,
        };
    }
    if new_size > LIMIT.with(Cell::get) {
        new_size = LIMIT.with(Cell::get);
        if end > new_size {
            return false;
        }
    }
    let layout = std::alloc::Layout::from_size_align(new_size, 8).expect("layout");
    let new_buf = unsafe { std::alloc::alloc(layout) };
    if new_buf.is_null() {
        return false;
    }
    unsafe {
        core::ptr::copy_nonoverlapping(BASE.with(Cell::get), new_buf, USED.with(Cell::get));
        let old_layout =
            std::alloc::Layout::from_size_align(SIZE.with(Cell::get), 8).expect("layout");
        std::alloc::dealloc(BASE.with(Cell::get), old_layout);
    }
    BASE.with(|b| b.set(new_buf));
    SIZE.with(|s| s.set(new_size));
    true
}

// ---------------------------------------------------------------------------
// typed accessors (all heap reads/writes go through these)
// ---------------------------------------------------------------------------

#[inline]
pub(crate) fn read_u8(base: u32, off: usize) -> u8 {
    unsafe { ptr(base).add(off).read_unaligned() }
}
#[inline]
pub(crate) fn write_u8(base: u32, off: usize, v: u8) {
    unsafe { ptr(base).add(off).write_unaligned(v) }
}
#[inline]
pub(crate) fn read_u32(base: u32, off: usize) -> u32 {
    unsafe { ptr(base).add(off).cast::<u32>().read_unaligned() }
}
#[inline]
pub(crate) fn write_u32(base: u32, off: usize, v: u32) {
    unsafe { ptr(base).add(off).cast::<u32>().write_unaligned(v) }
}
#[inline]
pub(crate) fn read_u64(base: u32, off: usize) -> u64 {
    unsafe { ptr(base).add(off).cast::<u64>().read_unaligned() }
}
#[inline]
pub(crate) fn write_u64(base: u32, off: usize, v: u64) {
    unsafe { ptr(base).add(off).cast::<u64>().write_unaligned(v) }
}
#[inline]
pub(crate) fn write_bytes(base: u32, off: usize, bytes: &[u8]) {
    unsafe { core::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr(base).add(off), bytes.len()) }
}

/// Copy bytes out of the emulated memory (native test helper).
#[cfg(not(target_arch = "wasm32"))]
pub fn read_bytes_for_test(base: u32, off: usize, len: usize) -> Vec<u8> {
    let mut out = vec![0u8; len];
    unsafe { core::ptr::copy_nonoverlapping(ptr(base).add(off), out.as_mut_ptr(), len) };
    out
}

// ---------------------------------------------------------------------------
// Growable u64 stack in the emulated memory (explicit work stacks for
// iterative algorithms; no Rust recursion).
// ---------------------------------------------------------------------------

pub(crate) struct Stack {
    ptr: u32,
    len: u32,
    cap: u32,
}

impl Stack {
    pub(crate) fn new() -> Self {
        Stack { ptr: 0, len: 0, cap: 0 }
    }

    pub(crate) fn push(&mut self, v: u64) -> Result<(), ()> {
        if self.len == self.cap {
            let new_cap = if self.cap == 0 { 64 } else { self.cap.checked_mul(2).ok_or(())? };
            let size = (new_cap as usize).checked_mul(8).ok_or(())?;
            let new_ptr = halloc(size).ok_or(())?;
            let mut i = 0;
            while i < self.len {
                write_u64(new_ptr, (i as usize) * 8, read_u64(self.ptr, (i as usize) * 8));
                i += 1;
            }
            self.ptr = new_ptr;
            self.cap = new_cap;
        }
        write_u64(self.ptr, (self.len as usize) * 8, v);
        self.len += 1;
        Ok(())
    }

    pub(crate) fn pop(&mut self) -> Option<u64> {
        if self.len == 0 {
            return None;
        }
        self.len -= 1;
        Some(read_u64(self.ptr, (self.len as usize) * 8))
    }

    pub(crate) fn len(&self) -> u32 {
        self.len
    }

    pub(crate) fn get(&self, i: u32) -> u64 {
        read_u64(self.ptr, (i as usize) * 8)
    }
}

// ---------------------------------------------------------------------------
// GlobalAlloc on wasm: Rust std allocations share the same bump region.
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
mod wasm_alloc {
    use super::*;
    use core::alloc::{GlobalAlloc, Layout};

    struct Bump;

    unsafe impl GlobalAlloc for Bump {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            match halloc_align(layout.size().max(1), layout.align()) {
                Some(off) => ptr(off),
                None => core::ptr::null_mut(),
            }
        }
        unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
            // Bump allocator: individual frees are no-ops; `reset()` reclaims.
        }
    }

    #[global_allocator]
    static GLOBAL: Bump = Bump;
}
