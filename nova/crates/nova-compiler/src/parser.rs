//! Hand-written recursive-descent parser, ported from the Lezer grammar
//! (`internal/lezer/src/dicexp.grammar` + `precedence-table.ts`) and the
//! desugarings of `packages/naive-evaluator/src/parsing/transformer.ts`.
//!
//! Binding powers (higher binds tighter), mirroring the grammar's
//! `@precedence` block and `precedence-table.ts`:
//!
//! ```text
//!   16  d/1 (unary dice)            15  d/2 (binary dice, @left)
//!   14  .   (value call, @left)     13  not/1, +/1, -/1 (prefix)
//!   12  **/2, ^/2 (@left)           11  * /// % (@left)
//!    9  +/2, -/2 (@left)             8  ~/1 (prefix)
//!    7  ~/2 (@left)                  6  # (@left)
//!    5  |> (@left)                   4  < > <= >= (@left)
//!    3  == != (@left)                2  and (@left)
//!    1  or (@left)
//! ```
//!
//! All binary operators are left-associative. Prefix operators bind tighter
//! than every binary operator looser than them: their operand is parsed with
//! the prefix operator's own binding power as `min_bp` (so `-3~4` = `(-3)~4`
//! and `~3+4` = `~(3+4)`, matching naive).

use crate::ast::{CallStyle, Node, Span, Value, ValueCallStyle};
use crate::error::CompileError;
use crate::lexer::{Lexer, Tok, TokKind};
use dicexp_nova_abi::error_key;

/// Binding powers.
mod bp {
    pub const DICE_BINARY: u8 = 15;
    pub const CALL: u8 = 14;
    pub const PREFIX_NOT_NEG: u8 = 13;
    pub const EXP: u8 = 12;
    pub const TIMES: u8 = 11;
    pub const PLUS: u8 = 9;
    pub const PREFIX_RANGE: u8 = 8;
    pub const RANGE: u8 = 7;
    pub const REPEAT: u8 = 6;
    pub const PIPE: u8 = 5;
    pub const COMPARE: u8 = 4;
    pub const EQUAL: u8 = 3;
    pub const AND: u8 = 2;
    pub const OR: u8 = 1;
}

/// The grammar restricts operands of `d` (`aroundDiceRoll`) to
/// `Grouping | LiteralInteger`; we track the syntactic origin of parsed nodes
/// to enforce this.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Origin {
    IntLiteral,
    Grouping,
    Other,
}

struct PNode {
    node: Node,
    origin: Origin,
}

pub fn parse(converted_src: &str) -> Result<Node, Vec<CompileError>> {
    let mut p = Parser::new(converted_src);
    match p.parse_top() {
        Ok(node) => Ok(node),
        Err(e) => Err(vec![e]),
    }
}

struct Parser {
    toks: Vec<Tok>,
    pos: usize,
    /// The half-width-normalized source as chars; spans are char indices.
    chars: Vec<char>,
}

impl Parser {
    fn new(src: &str) -> Self {
        Parser { toks: Lexer::new(src).lex_all(), pos: 0, chars: src.chars().collect() }
    }
}

impl Parser {
    // ------------------------------------------------------------------
    // token utilities
    // ------------------------------------------------------------------

    fn peek(&self) -> Tok {
        self.toks[self.pos]
    }

    fn peek_kind(&self) -> TokKind {
        self.toks[self.pos].kind
    }

    fn advance(&mut self) -> Tok {
        let t = self.toks[self.pos];
        if t.kind != TokKind::Eof {
            self.pos += 1;
        }
        t
    }

    /// Token text (spans are char indices; the lexer tokenized the same char
    /// sequence, so slicing chars is exact).
    fn text(&self, tok: Tok) -> String {
        let (s, e) = tok.span;
        self.chars[s as usize..e as usize].iter().collect()
    }

    fn syntax_err(&self) -> CompileError {
        CompileError::new(error_key::PARSE_SYNTAX_ERROR, self.peek().span)
    }

    fn err_at(&self, key: u32, span: Span) -> CompileError {
        CompileError::new(key, span)
    }

    // ------------------------------------------------------------------
    // top level
    // ------------------------------------------------------------------

    fn parse_top(&mut self) -> Result<Node, CompileError> {
        let node = self.parse_expr(0, false)?;
        if self.peek_kind() != TokKind::Eof {
            return Err(self.syntax_err());
        }
        Ok(node.node)
    }

    // ------------------------------------------------------------------
    // precedence-climbing expression parser
    // ------------------------------------------------------------------

    /// `no_pipe` excludes the pipe operator from the infix loop, used for
    /// closure bodies (grammar: `expressionWithoutPipe`). Note that this is
    /// NOT a precedence level: `expressionWithoutPipe` still includes
    /// operators *looser* than `|>` (compare/equal/and/or).
    fn parse_expr(&mut self, min_bp: u8, no_pipe: bool) -> Result<PNode, CompileError> {
        let mut left = self.parse_prefix(no_pipe)?;
        loop {
            // dicexp 仅支持整除 “//”: a bare `/` anywhere in an expression
            // gets the friendly error.
            if self.peek_kind() == TokKind::Slash {
                let span = self.peek().span;
                return Err(self.err_at(error_key::PARSE_SLASH_SUGGEST_DIV, span));
            }
            let Some(op) = self.infix_op() else { break };
            if op.bp < min_bp || (no_pipe && op.kind == InfixKind::Pipe) {
                break;
            }
            left = self.parse_infix(left, op, no_pipe)?;
        }
        Ok(left)
    }

    fn infix_op(&self) -> Option<InfixOp> {
        let t = self.peek();
        let (bp, kind) = match t.kind {
            TokKind::KeywordD => (bp::DICE_BINARY, InfixKind::Dice),
            TokKind::Dot => (bp::CALL, InfixKind::Call),
            TokKind::StarStar => (bp::EXP, InfixKind::Binary("**")),
            TokKind::Caret => (bp::EXP, InfixKind::Binary("^")),
            TokKind::Star => (bp::TIMES, InfixKind::Binary("*")),
            TokKind::SlashSlash => (bp::TIMES, InfixKind::Binary("//")),
            TokKind::Percent => (bp::TIMES, InfixKind::Binary("%")),
            TokKind::Plus => (bp::PLUS, InfixKind::Binary("+")),
            TokKind::Minus => (bp::PLUS, InfixKind::Binary("-")),
            TokKind::Tilde => (bp::RANGE, InfixKind::Binary("~")),
            TokKind::Hash => (bp::REPEAT, InfixKind::Repeat),
            TokKind::Pipe => (bp::PIPE, InfixKind::Pipe),
            TokKind::Lt => (bp::COMPARE, InfixKind::Binary("<")),
            TokKind::Gt => (bp::COMPARE, InfixKind::Binary(">")),
            TokKind::Le => (bp::COMPARE, InfixKind::Binary("<=")),
            TokKind::Ge => (bp::COMPARE, InfixKind::Binary(">=")),
            TokKind::EqEq => (bp::EQUAL, InfixKind::Binary("==")),
            TokKind::NotEq => (bp::EQUAL, InfixKind::Binary("!=")),
            TokKind::Ident => match self.text(t).as_str() {
                "and" => (bp::AND, InfixKind::Binary("and")),
                "or" => (bp::OR, InfixKind::Binary("or")),
                _ => return None,
            },
            _ => return None,
        };
        Some(InfixOp { bp, kind })
    }

    fn parse_infix(&mut self, left: PNode, op: InfixOp, no_pipe: bool) -> Result<PNode, CompileError> {
        let start = left.node.span().0;
        match op.kind {
            InfixKind::Dice => {
                // aroundDiceRoll !diceRoll binaryOperatorDiceRoll aroundDiceRoll
                let d_tok = self.advance();
                if !matches!(left.origin, Origin::IntLiteral | Origin::Grouping) {
                    return Err(self.err_at(error_key::PARSE_SYNTAX_ERROR, d_tok.span));
                }
                let right = self.parse_dice_operand()?;
                let right = fold_dice_operand(right);
                let end = right.span().1;
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Operator,
                        name: "d".to_string(),
                        name_span: d_tok.span,
                        args: vec![left.node, right],
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
            InfixKind::Call => {
                // expression !call BinaryOperator<"."> ArgumentList
                self.advance();
                let (args, end) = self.parse_argument_list()?;
                Ok(PNode {
                    node: Node::ValueCall {
                        style: ValueCallStyle::Function,
                        variable: Box::new(left.node),
                        args,
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
            InfixKind::Repeat => {
                // expression !repeat BinaryOperator<"#"> expression
                self.advance();
                let right = self.parse_expr(op.bp + 1, no_pipe)?;
                let end = right.node.span().1;
                Ok(PNode {
                    node: Node::Repetition {
                        count: Box::new(left.node),
                        body: Box::new(right.node),
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
            InfixKind::Pipe => {
                // expression !pipe BinaryOperator<"|>"> expression
                self.advance();
                self.desugar_pipe(left, start, no_pipe)
            }
            InfixKind::Binary(name) => {
                let op_tok = self.advance();
                let right = self.parse_expr(op.bp + 1, no_pipe)?;
                let end = right.node.span().1;
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Operator,
                        name: name.to_string(),
                        name_span: op_tok.span,
                        args: vec![left.node, right.node],
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
        }
    }

    /// transformer.ts `_transformPipeExpression`:
    /// `a |> f(b,c)` → `f(a,b,c)`, `a |> f` → `f(a)`,
    /// `a |> closure.()` → value call with `a` prepended.
    fn desugar_pipe(&mut self, left: PNode, start: u32, no_pipe: bool) -> Result<PNode, CompileError> {
        let right = self.parse_expr(bp::PIPE + 1, no_pipe)?;
        let end = right.node.span().1;
        match right.node {
            Node::Variable(name, name_span) => Ok(PNode {
                node: Node::RegularCall {
                    style: CallStyle::Piped,
                    name,
                    name_span,
                    args: vec![left.node],
                    span: (start, end),
                },
                origin: Origin::Other,
            }),
            Node::RegularCall {
                style: CallStyle::Function,
                name,
                name_span,
                mut args,
                ..
            } => {
                let mut all_args = Vec::with_capacity(args.len() + 1);
                all_args.push(left.node);
                all_args.append(&mut args);
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Piped,
                        name,
                        name_span,
                        args: all_args,
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
            Node::ValueCall {
                style: ValueCallStyle::Function,
                variable,
                mut args,
                ..
            } => {
                let mut all_args = Vec::with_capacity(args.len() + 1);
                all_args.push(left.node);
                all_args.append(&mut args);
                Ok(PNode {
                    node: Node::ValueCall {
                        style: ValueCallStyle::Piped,
                        variable,
                        args: all_args,
                        span: (start, end),
                    },
                    origin: Origin::Other,
                })
            }
            other => Err(self.err_at(error_key::PARSE_BAD_PIPE_TARGET, other.span())),
        }
    }

    // ------------------------------------------------------------------
    // prefix position
    // ------------------------------------------------------------------

    fn parse_prefix(&mut self, no_pipe: bool) -> Result<PNode, CompileError> {
        let t = self.peek();
        match t.kind {
            TokKind::Int => {
                self.advance();
                let v = self.parse_int_literal(t)?;
                let span = t.span;
                Ok(PNode {
                    node: Node::Value(Value::Integer(v), span),
                    origin: Origin::IntLiteral,
                })
            }
            TokKind::KeywordD => {
                // !diceRollUnary unaryOperatorDiceRoll aroundDiceRoll
                self.advance();
                let operand = self.parse_dice_operand()?;
                let operand = fold_dice_operand(operand);
                let end = operand.span().1;
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Operator,
                        name: "d".to_string(),
                        name_span: t.span,
                        args: vec![operand],
                        span: (t.span.0, end),
                    },
                    origin: Origin::Other,
                })
            }
            TokKind::Plus | TokKind::Minus => {
                self.advance();
                let name = if t.kind == TokKind::Plus { "+" } else { "-" };
                let operand = self.parse_expr(bp::PREFIX_NOT_NEG, no_pipe)?;
                let end = operand.node.span().1;
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Operator,
                        name: name.to_string(),
                        name_span: t.span,
                        args: vec![operand.node],
                        span: (t.span.0, end),
                    },
                    origin: Origin::Other,
                })
            }
            TokKind::Tilde => {
                self.advance();
                let operand = self.parse_expr(bp::PREFIX_RANGE, no_pipe)?;
                let end = operand.node.span().1;
                Ok(PNode {
                    node: Node::RegularCall {
                        style: CallStyle::Operator,
                        name: "~".to_string(),
                        name_span: t.span,
                        args: vec![operand.node],
                        span: (t.span.0, end),
                    },
                    origin: Origin::Other,
                })
            }
            TokKind::Ident => {
                let text = self.text(t);
                match text.as_str() {
                    "not" => {
                        self.advance();
                        let operand = self.parse_expr(bp::PREFIX_NOT_NEG, no_pipe)?;
                        let end = operand.node.span().1;
                        Ok(PNode {
                            node: Node::RegularCall {
                                style: CallStyle::Operator,
                                name: "not".to_string(),
                                name_span: t.span,
                                args: vec![operand.node],
                                span: (t.span.0, end),
                            },
                            origin: Origin::Other,
                        })
                    }
                    "true" | "false" => {
                        self.advance();
                        Ok(PNode {
                            node: Node::Value(Value::Boolean(text == "true"), t.span),
                            origin: Origin::Other,
                        })
                    }
                    // `and`/`or` in prefix position are syntax errors (naive
                    // specializes them to BinaryOperator and fails likewise).
                    "and" | "or" => Err(self.syntax_err()),
                    _ => {
                        let next = self.toks.get(self.pos + 1).map(|t| t.kind);
                        if matches!(next, Some(TokKind::OpenParen) | Some(TokKind::Bar)) {
                            self.parse_regular_call()
                        } else {
                            self.advance();
                            Ok(PNode {
                                node: Node::Variable(text.clone(), t.span),
                                origin: Origin::Other,
                            })
                        }
                    }
                }
            }
            TokKind::IdentUser | TokKind::IdentExternal => {
                self.advance();
                let text = self.text(t);
                Ok(PNode {
                    node: Node::Variable(text, t.span),
                    origin: Origin::Other,
                })
            }
            TokKind::OpenParen => {
                self.advance();
                let inner = self.parse_expr(0, false)?;
                if self.peek_kind() != TokKind::CloseParen {
                    return Err(self.syntax_err());
                }
                self.advance();
                Ok(PNode { node: inner.node, origin: Origin::Grouping })
            }
            TokKind::OpenSBracket => self.parse_list(),
            TokKind::Bar => self.parse_closure(),
            TokKind::Amp => self.parse_capture(),
            // dicexp 仅支持整除 “//”
            TokKind::Slash => {
                Err(self.err_at(error_key::PARSE_SLASH_SUGGEST_DIV, t.span))
            }
            _ => Err(self.syntax_err()),
        }
    }

    // ------------------------------------------------------------------
    // compound forms
    // ------------------------------------------------------------------

    /// RegularCall: `FunctionName (ArgumentList Closure? | Closure)`.
    fn parse_regular_call(&mut self) -> Result<PNode, CompileError> {
        let name_tok = self.advance(); // the Ident
        let name = self.text(name_tok);
        let start = name_tok.span.0;
        let mut end = name_tok.span.1;
        let mut args = Vec::new();
        if self.peek_kind() == TokKind::OpenParen {
            let (list, list_end) = self.parse_argument_list()?;
            args = list;
            end = list_end;
        }
        if self.peek_kind() == TokKind::Bar {
            let closure = self.parse_closure()?;
            end = closure.node.span().1;
            args.push(closure.node);
        }
        debug_assert!(!args.is_empty() || end != name_tok.span.1);
        Ok(PNode {
            node: Node::RegularCall {
                style: CallStyle::Function,
                name,
                name_span: name_tok.span,
                args,
                span: (start, end),
            },
            origin: Origin::Other,
        })
    }

    /// ArgumentList: `OpenParen commaSeparated<expression> CloseParen`.
    /// Returns the args and the close-paren end.
    fn parse_argument_list(&mut self) -> Result<(Vec<Node>, u32), CompileError> {
        if self.peek_kind() != TokKind::OpenParen {
            return Err(self.syntax_err());
        }
        self.advance();
        let mut args = Vec::new();
        if self.peek_kind() == TokKind::CloseParen {
            let end = self.advance().span.1;
            return Ok((args, end));
        }
        loop {
            let arg = self.parse_expr(0, false)?;
            args.push(arg.node);
            match self.peek_kind() {
                TokKind::Comma => {
                    self.advance();
                }
                TokKind::CloseParen => {
                    let end = self.advance().span.1;
                    return Ok((args, end));
                }
                _ => return Err(self.syntax_err()),
            }
        }
    }

    /// List: `OpenSBracket commaSeparated<expression> CloseSBracket`.
    fn parse_list(&mut self) -> Result<PNode, CompileError> {
        let start = self.advance().span.0; // `[`
        let mut items = Vec::new();
        if self.peek_kind() == TokKind::CloseSBracket {
            let end = self.advance().span.1;
            return Ok(PNode {
                node: Node::Value(Value::List(items), (start, end)),
                origin: Origin::Other,
            });
        }
        loop {
            let item = self.parse_expr(0, false)?;
            items.push(item.node);
            match self.peek_kind() {
                TokKind::Comma => {
                    self.advance();
                }
                TokKind::CloseSBracket => {
                    let end = self.advance().span.1;
                    return Ok(PNode {
                        node: Node::Value(Value::List(items), (start, end)),
                        origin: Origin::Other,
                    });
                }
                _ => return Err(self.syntax_err()),
            }
        }
    }

    /// Closure: `"|" commaSeparated<idUserDefined | idIgnore> "|"
    /// expressionWithoutPipe`. The body excludes top-level pipes, so
    /// `|$x| $x |> f` parses as `(|$x| $x) |> f` like naive.
    fn parse_closure(&mut self) -> Result<PNode, CompileError> {
        let start = self.advance().span.0; // `|`
        let mut params: Vec<(String, Span)> = Vec::new();
        if self.peek_kind() != TokKind::Bar {
            loop {
                let t = self.peek();
                match t.kind {
                    TokKind::IdentUser => {
                        self.advance();
                        params.push((self.text(t), t.span));
                    }
                    TokKind::Underscore => {
                        self.advance();
                        params.push(("_".to_string(), t.span));
                    }
                    _ => return Err(self.syntax_err()),
                }
                if self.peek_kind() == TokKind::Comma {
                    self.advance();
                } else {
                    break;
                }
            }
        }
        if self.peek_kind() != TokKind::Bar {
            return Err(self.syntax_err());
        }
        self.advance();
        let body = self.parse_expr(0, true)?; // expressionWithoutPipe
        let end = body.node.span().1;
        Ok(PNode {
            node: Node::Value(
                Value::Closure { params, body: Box::new(body.node) },
                (start, end),
            ),
            origin: Origin::Other,
        })
    }

    /// Capture: `"&" Identifier "/" LiteralInteger`, with NO whitespace
    /// allowed inside (the grammar puts Capture in `@skip {}`).
    ///
    /// Identifier alternatives per the grammar: any `idBuiltin`, `keywordD`,
    /// `* ^ ** // % + - ~ < <= > >= == != and or not` — but NOT `#` or `|>`.
    ///
    /// [DEVIATION] naive (Lezer) rejects `&</2`, `&<=/2`, `&>/2`, `&>=/2`,
    /// `&==/2` due to a tokenization quirk although the grammar lists them;
    /// nova accepts them (see compat.md report).
    fn parse_capture(&mut self) -> Result<PNode, CompileError> {
        let amp = self.advance(); // `&`
        let start = amp.span.0;

        let name_tok = self.peek();
        if name_tok.span.0 != amp.span.1 {
            return Err(self.syntax_err());
        }
        let name: String = match name_tok.kind {
            TokKind::Ident => {
                let s = self.text(name_tok);
                // `true`/`false` are LiteralBoolean, not capturable.
                if s == "true" || s == "false" {
                    return Err(self.syntax_err());
                }
                s
            }
            TokKind::KeywordD => "d".to_string(),
            TokKind::Star => "*".to_string(),
            TokKind::StarStar => "**".to_string(),
            TokKind::Caret => "^".to_string(),
            TokKind::SlashSlash => "//".to_string(),
            TokKind::Percent => "%".to_string(),
            TokKind::Plus => "+".to_string(),
            TokKind::Minus => "-".to_string(),
            TokKind::Tilde => "~".to_string(),
            TokKind::Lt => "<".to_string(),
            TokKind::Le => "<=".to_string(),
            TokKind::Gt => ">".to_string(),
            TokKind::Ge => ">=".to_string(),
            TokKind::EqEq => "==".to_string(),
            TokKind::NotEq => "!=".to_string(),
            _ => return Err(self.syntax_err()),
        };
        self.advance();

        let slash_tok = self.peek();
        if slash_tok.kind != TokKind::Slash || slash_tok.span.0 != name_tok.span.1 {
            return Err(self.syntax_err());
        }
        self.advance();

        let int_tok = self.peek();
        if int_tok.kind != TokKind::Int || int_tok.span.0 != slash_tok.span.1 {
            return Err(self.syntax_err());
        }
        self.advance();
        let arity = self.parse_int_literal(int_tok)?;

        Ok(PNode {
            node: Node::Value(
                Value::Captured { identifier: name, arity },
                (start, int_tok.span.1),
            ),
            origin: Origin::Other,
        })
    }

    // ------------------------------------------------------------------
    // dice operands & integer literals
    // ------------------------------------------------------------------

    /// `aroundDiceRoll`: `Grouping | LiteralInteger`.
    fn parse_dice_operand(&mut self) -> Result<Node, CompileError> {
        let t = self.peek();
        match t.kind {
            TokKind::Int => {
                self.advance();
                let v = self.parse_int_literal(t)?;
                Ok(Node::Value(Value::Integer(v), t.span))
            }
            TokKind::OpenParen => {
                self.advance();
                let inner = self.parse_expr(0, false)?;
                if self.peek_kind() != TokKind::CloseParen {
                    return Err(self.syntax_err());
                }
                self.advance();
                Ok(inner.node)
            }
            _ => Err(self.syntax_err()),
        }
    }

    /// utils.ts `parseInteger`: `_` separators stripped; must fit the safe
    /// range ±(2^53−1) — naive errors (`badIntegerLiteral`) and so does nova
    /// (PARSE_INTEGER_LITERAL_TOO_LARGE, param = stripped literal text).
    fn parse_int_literal(&self, tok: Tok) -> Result<i64, CompileError> {
        let raw = self.text(tok);
        let stripped: String = raw.chars().filter(|&c| c != '_').collect();
        let mut v: i64 = 0;
        for c in stripped.chars() {
            let d = (c as i64) - ('0' as i64);
            v = v * 10 + d;
            if v > dicexp_nova_abi::MAX_SAFE_INTEGER {
                return Err(CompileError::with_str(
                    error_key::PARSE_INTEGER_LITERAL_TOO_LARGE,
                    tok.span,
                    stripped,
                ));
            }
        }
        Ok(v)
    }
}

struct InfixOp {
    bp: u8,
    kind: InfixKind,
}

#[derive(PartialEq, Eq)]
enum InfixKind {
    Dice,
    Call,
    Repeat,
    Pipe,
    Binary(&'static str),
}

/// transformer.ts `_handleAfterDiceRoll`: folds a unary `+`/`-` applied to
/// the (grouped) dice operand: `d(+x)` → `d(x)`; `d(-x)` → `d(-4)` (only when
/// `x` is an integer literal, otherwise the unary `-` call is kept).
fn fold_dice_operand(node: Node) -> Node {
    let Node::RegularCall {
        style: CallStyle::Operator,
        name,
        name_span,
        mut args,
        span,
    } = node
    else {
        return node;
    };
    if args.len() != 1 || (name != "+" && name != "-") {
        return Node::RegularCall {
            style: CallStyle::Operator,
            name,
            name_span,
            args,
            span,
        };
    }
    let inner = args.remove(0);
    if name == "+" {
        return inner;
    }
    match inner {
        Node::Value(Value::Integer(n), s) => Node::Value(Value::Integer(-n), s),
        other => Node::RegularCall {
            style: CallStyle::Operator,
            name,
            name_span,
            args: vec![other],
            span,
        },
    }
}
