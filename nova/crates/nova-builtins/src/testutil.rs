//! Native-only helpers exposing internals to integration tests
//! (the emulated linear memory is opaque outside the crate).

use crate::mem;
use crate::rng;
use crate::values;

pub fn int(v: i64) -> i64 {
    values::integer_to_value(v) as i64
}

pub fn boolean(b: bool) -> i64 {
    values::boolean_to_value(b) as i64
}

pub fn heap_handle(ptr: u32) -> i64 {
    values::heap_ptr_to_value(ptr) as i64
}

pub fn handle_ptr(v: i64) -> u32 {
    values::value_to_heap_ptr(v as u64)
}

pub fn tag(v: i64) -> u64 {
    values::value_tag(v as u64)
}

pub fn kind_of(v: i64) -> u8 {
    mem::read_u8(values::value_to_heap_ptr(v as u64), 0)
}

pub fn thunk_state_of(v: i64) -> u8 {
    values::thunk_read(values::value_to_heap_ptr(v as u64)).state
}

pub fn list_len_of(v: i64) -> u32 {
    values::list_len(values::value_to_heap_ptr(v as u64))
}

pub fn list_elem_of(v: i64, i: u32) -> i64 {
    values::list_elem(values::value_to_heap_ptr(v as u64), i) as i64
}

pub fn error_key_of(v: i64) -> u32 {
    values::error_key(values::value_to_heap_ptr(v as u64))
}

/// (tag, payload) pairs of an ERROR object; STRING payloads stay offsets
/// (read with `string_of`).
pub fn error_params_of(v: i64) -> Vec<(u8, u64)> {
    let p = values::value_to_heap_ptr(v as u64);
    let blk = values::error_params_block(p);
    let count = values::params_count(blk);
    (0..count)
        .map(|i| (values::param_tag(blk, i), values::param_payload(blk, i)))
        .collect()
}

pub fn string_of(sp: u32) -> Vec<u8> {
    let len = values::string_len(sp);
    let mut out = vec![0u8; len as usize];
    for i in 0..len {
        out[i as usize] = mem::read_u8(sp, 8 + i as usize);
    }
    out
}

pub fn string_param_of(v: i64, i: usize) -> String {
    let params = error_params_of(v);
    String::from_utf8(string_of(params[i].1 as u32)).expect("utf8")
}

pub fn make_error(key: u32, params: &[(u8, u64)]) -> i64 {
    values::error_new(key, params) as i64
}

pub fn make_string(s: &str) -> u32 {
    values::string_new(s.as_bytes()).expect("string alloc")
}

pub fn read_result_bytes(ptr: i32, len: i32) -> Vec<u8> {
    let mut out = vec![0u8; len as usize];
    for i in 0..len as usize {
        out[i] = mem::read_u8(ptr as u32, i);
    }
    out
}

pub fn write_arg_slot(args_ptr: i32, i: usize, v: i64) {
    mem::write_u64(args_ptr as u32, i * 8, v as u64);
}

/// Write the i-th u64 slot of an object's payload (at offset 8 + i*8);
/// works for LIST elems and ENV slots, which share that layout.
pub fn write_obj_slot(obj_ptr: i32, i: usize, v: i64) {
    mem::write_u64(obj_ptr as u32, 8 + i * 8, v as u64);
}

pub fn read_arg_slot(args_ptr: i32, i: usize) -> i64 {
    mem::read_u64(args_ptr as u32, i * 8) as i64
}

pub fn rng_seed(seed: i32) {
    rng::seed(seed);
}

pub fn rng_next_u32() -> u32 {
    rng::next_u32()
}

pub fn rng_integer(lower: i64, upper: i64) -> i64 {
    rng::integer(lower, upper)
}

pub fn set_mem_limit(bytes: usize) {
    mem::set_limit_for_test(bytes);
}

pub fn reset_mem_limit() {
    mem::reset_limit_for_test();
}

pub fn heap_used() -> usize {
    mem::used_for_test()
}
