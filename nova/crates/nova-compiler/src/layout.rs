//! Heap object byte layouts that the emitted program module depends on for
//! direct loads/stores (plan §4: list elements and env slots are stored by
//! compiled code directly into the imported memory).
//!
//! These are NOT currently defined in `dicexp-nova-abi`; they are defined
//! here and MUST be matched by `dicexp-nova-builtins`:
//!
//! ```text
//! object header (8 bytes): { kind: u8 @0, flags: u8 @1, _reserved: u16 @2,
//!                            len: u32 @4 }
//! ENV  (kind 4): { parent: u32 @8 (byte offset, 0 = none), _pad: u32 @12,
//!                  slots: [u64; len] @16 }
//! LIST (kind 5): { elems: [u64; len] @8 }
//! ```

/// Byte offset of an ENV object's `parent` field (u32 raw heap byte offset).
pub const ENV_PARENT_OFFSET: u64 = 8;

/// Byte offset of an ENV object's first slot (u64 handles, 8-byte aligned).
pub const ENV_SLOTS_OFFSET: u64 = 16;

/// Byte offset of a LIST object's first element (u64 handles).
pub const LIST_ELEMS_OFFSET: u64 = 8;

/// Byte offset of slot `i` within an ENV object.
pub const fn env_slot_offset(i: u32) -> u64 {
    ENV_SLOTS_OFFSET + (i as u64) * 8
}

/// Byte offset of element `i` within a LIST object.
pub const fn list_elem_offset(i: u32) -> u64 {
    LIST_ELEMS_OFFSET + (i as u64) * 8
}
