//! Structured compile errors (plan §3.7) and their wire encoding (the
//! compiler-side counterpart of plan §3.6's param encoding).

use dicexp_nova_abi::param_tag;

/// One structured compile error with a source span (char indices).
#[derive(Clone, Debug, PartialEq)]
pub struct CompileError {
    pub key: u32,
    pub span: (u32, u32),
    pub params: Vec<ErrParam>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ErrParam {
    Int(i64),
    Str(String),
    ValueType(u8),
    ValueTypeSet(u8),
}

impl CompileError {
    pub fn new(key: u32, span: (u32, u32)) -> Self {
        CompileError { key, span, params: Vec::new() }
    }

    pub fn with_str(key: u32, span: (u32, u32), s: impl Into<String>) -> Self {
        CompileError { key, span, params: vec![ErrParam::Str(s.into())] }
    }
}

/// Encode errors into the cdylib error buffer (consumed by
/// `decodeCompileErrors` in `@dicexp/nova`):
///
/// ```text
/// u32le count
/// per error: u32le key, u32le start, u32le end, u32le param_count,
///            then params: tag u8; 0 → i64le, 1 → u32le len + utf8, 2|3 → u8
/// ```
pub fn encode_error_buffer(errors: &[CompileError]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&(errors.len() as u32).to_le_bytes());
    for e in errors {
        out.extend_from_slice(&e.key.to_le_bytes());
        out.extend_from_slice(&e.span.0.to_le_bytes());
        out.extend_from_slice(&e.span.1.to_le_bytes());
        out.extend_from_slice(&(e.params.len() as u32).to_le_bytes());
        for p in &e.params {
            match p {
                ErrParam::Int(v) => {
                    out.push(param_tag::INT);
                    out.extend_from_slice(&v.to_le_bytes());
                }
                ErrParam::Str(s) => {
                    out.push(param_tag::STRING);
                    out.extend_from_slice(&(s.len() as u32).to_le_bytes());
                    out.extend_from_slice(s.as_bytes());
                }
                ErrParam::ValueType(t) => {
                    out.push(param_tag::VALUE_TYPE);
                    out.push(*t);
                }
                ErrParam::ValueTypeSet(m) => {
                    out.push(param_tag::VALUE_TYPE_SET);
                    out.push(*m);
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_the_wire_format() {
        let errors = vec![
            CompileError::with_str(1000, (2, 5), "foo/1"),
            CompileError {
                key: 2000,
                span: (0, 0),
                params: vec![ErrParam::Int(-3), ErrParam::ValueType(4), ErrParam::ValueTypeSet(0b101)],
            },
        ];
        let buf = encode_error_buffer(&errors);
        let mut expected: Vec<u8> = Vec::new();
        expected.extend_from_slice(&2u32.to_le_bytes()); // count
        // error 1
        expected.extend_from_slice(&1000u32.to_le_bytes());
        expected.extend_from_slice(&2u32.to_le_bytes());
        expected.extend_from_slice(&5u32.to_le_bytes());
        expected.extend_from_slice(&1u32.to_le_bytes()); // 1 param
        expected.push(1); // string tag
        expected.extend_from_slice(&5u32.to_le_bytes());
        expected.extend_from_slice(b"foo/1");
        // error 2
        expected.extend_from_slice(&2000u32.to_le_bytes());
        expected.extend_from_slice(&0u32.to_le_bytes());
        expected.extend_from_slice(&0u32.to_le_bytes());
        expected.extend_from_slice(&3u32.to_le_bytes()); // 3 params
        expected.push(0);
        expected.extend_from_slice(&(-3i64).to_le_bytes());
        expected.push(2);
        expected.push(4);
        expected.push(3);
        expected.push(0b101);
        assert_eq!(buf, expected);
    }
}
