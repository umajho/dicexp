//! AST shapes, mirroring `internal/nodes/lib.ts` (naive) with spans added.
//!
//! Differences from naive's `Node` (all repr-only, see plan §2 "repr is out of
//! scope for v1"): `Node_Repetition.bodyRaw` and `NodeValue_Closure.raw` are
//! dropped. `style` fields are kept because the pipe desugaring rules inspect
//! them (see transformer.ts `_transformPipeExpression`).

/// A span of Unicode-scalar (char) indices into the (half-width-normalized)
/// source. `start` inclusive, `end` exclusive.
pub type Span = (u32, u32);

#[derive(Clone, Debug)]
pub enum Node {
    /// naive's `Node_RegularCall` (operators, function calls, piped calls).
    RegularCall {
        style: CallStyle,
        name: String,
        /// Span of the function name / operator token (for error reporting).
        name_span: Span,
        args: Vec<Node>,
        span: Span,
    },
    /// naive's `Node_ValueCall` (`callee.(args…)`).
    ValueCall {
        style: ValueCallStyle,
        variable: Box<Node>,
        args: Vec<Node>,
        span: Span,
    },
    /// naive's `Node_Repetition` (`count # body`).
    Repetition {
        count: Box<Node>,
        body: Box<Node>,
        span: Span,
    },
    /// naive's `Node_Value`.
    Value(Value, Span),
    /// naive's `string` node (an identifier, raw text incl. `$`/`@` prefixes).
    Variable(String, Span),
}

/// naive's `RegularCallStyle`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CallStyle {
    Function,
    Operator,
    Piped,
}

/// naive's `ValueCallStyle`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ValueCallStyle {
    Function,
    Piped,
}

#[derive(Clone, Debug)]
pub enum Value {
    /// naive: `number` (already range-checked to ±(2^53−1)).
    Integer(i64),
    /// naive: `boolean`.
    Boolean(bool),
    /// naive's `NodeValue_List`.
    List(Vec<Node>),
    /// naive's `NodeValue_Closure`.
    Closure {
        /// Raw parameter texts (`"$x"` or `"_"`), with spans.
        params: Vec<(String, Span)>,
        body: Box<Node>,
    },
    /// naive's `NodeValue_Captured`.
    Captured {
        identifier: String,
        /// Parsed arity (range-checked like any integer literal).
        arity: i64,
    },
}

impl Node {
    pub fn span(&self) -> Span {
        match self {
            Node::RegularCall { span, .. } => *span,
            Node::ValueCall { span, .. } => *span,
            Node::Repetition { span, .. } => *span,
            Node::Value(_, span) => *span,
            Node::Variable(_, span) => *span,
        }
    }
}
