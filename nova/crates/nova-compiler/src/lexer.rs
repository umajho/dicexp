//! Full-width → half-width normalization (ported from
//! `packages/naive-evaluator/src/parsing/utils.ts`) and the tokenizer (ported
//! from `internal/lezer/src/tokens.ts` + the `@tokens` block of
//! `internal/lezer/src/dicexp.grammar`).
//!
//! Token spans are Unicode-scalar (char) indices into the normalized source,
//! which are identical to char indices into the original source because the
//! normalization is 1:1 per character.

/// naive: `convertTextToHalfWidth` maps U+FF01..=U+FF5E by subtracting the
/// width delta (0xFEE0). One char maps to one char, so indices are stable.
pub fn to_half_width(src: &str) -> String {
    src.chars()
        .map(|c| {
            if ('\u{FF01}'..='\u{FF5E}').contains(&c) {
                // U+FF01..=U+FF5E minus 0xFEE0 is always a valid ASCII char.
                char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TokKind {
    /// `[0-9]+(_[0-9]+)*`
    Int,
    /// Unprefixed identifier (incl. `and`/`or`/`not`/`true`/`false` texts).
    Ident,
    /// `$name`
    IdentUser,
    /// `@name` / `@@name` / `@_name`
    IdentExternal,
    /// Exactly `_` (grammar's `idIgnore`).
    Underscore,
    /// The dice operator `d` (grammar's `keywordD`).
    KeywordD,
    OpenParen,
    CloseParen,
    OpenSBracket,
    CloseSBracket,
    Comma,
    /// `|>`
    Pipe,
    /// `|`
    Bar,
    Dot,
    Hash,
    Amp,
    /// `/` — only ever appears alone; dicexp's division is `//`.
    Slash,
    Star,
    StarStar,
    Caret,
    SlashSlash,
    Percent,
    Plus,
    Minus,
    Tilde,
    EqEq,
    NotEq,
    Lt,
    Gt,
    Le,
    Ge,
    /// Any other character (the parser reports it as a syntax error).
    Invalid,
    Eof,
}

#[derive(Clone, Copy, Debug)]
pub struct Tok {
    pub kind: TokKind,
    /// Char-index span `[start, end)`.
    pub span: (u32, u32),
}

fn is_ident_start(c: char) -> bool {
    // tokens.ts: /[\p{ID_Start}_]/u
    c == '_' || unicode_ident::is_xid_start(c)
}

fn is_ident_continue(c: char) -> bool {
    // tokens.ts: /\p{ID_Continue}/u ("_" 在里边)
    unicode_ident::is_xid_continue(c)
}

pub struct Lexer {
    /// The normalized source as chars; indices are char indices.
    chars: Vec<char>,
    pos: usize,
}

impl Lexer {
    pub fn new(src: &str) -> Self {
        Lexer { chars: src.chars().collect(), pos: 0 }
    }

    pub fn lex_all(mut self) -> Vec<Tok> {
        let mut toks = Vec::new();
        loop {
            let t = self.next_tok();
            let end = t.kind == TokKind::Eof;
            toks.push(t);
            if end {
                break;
            }
        }
        toks
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn peek2(&self) -> Option<char> {
        self.chars.get(self.pos + 1).copied()
    }

    fn next_tok(&mut self) -> Tok {
        // @skip { ws }: $[ \t\r\n]
        while matches!(self.peek(), Some(' ' | '\t' | '\r' | '\n')) {
            self.pos += 1;
        }
        let start = self.pos as u32;
        let kind = self.lex_token();
        Tok { kind, span: (start, self.pos as u32) }
    }

    fn lex_token(&mut self) -> TokKind {
        let Some(c) = self.peek() else {
            return TokKind::Eof;
        };
        match c {
            '0'..='9' => self.lex_int(),
            '$' | '@' => self.lex_identifier(),
            '(' => self.one(TokKind::OpenParen),
            ')' => self.one(TokKind::CloseParen),
            '[' => self.one(TokKind::OpenSBracket),
            ']' => self.one(TokKind::CloseSBracket),
            ',' => self.one(TokKind::Comma),
            '.' => self.one(TokKind::Dot),
            '#' => self.one(TokKind::Hash),
            '&' => self.one(TokKind::Amp),
            '%' => self.one(TokKind::Percent),
            '+' => self.one(TokKind::Plus),
            '-' => self.one(TokKind::Minus),
            '~' => self.one(TokKind::Tilde),
            '|' => {
                if self.peek2() == Some('>') {
                    self.pos += 2;
                    TokKind::Pipe
                } else {
                    self.one(TokKind::Bar)
                }
            }
            '*' => {
                if self.peek2() == Some('*') {
                    self.pos += 2;
                    TokKind::StarStar
                } else {
                    self.one(TokKind::Star)
                }
            }
            '^' => self.one(TokKind::Caret),
            '/' => {
                if self.peek2() == Some('/') {
                    self.pos += 2;
                    TokKind::SlashSlash
                } else {
                    self.one(TokKind::Slash)
                }
            }
            '=' => {
                if self.peek2() == Some('=') {
                    self.pos += 2;
                    TokKind::EqEq
                } else {
                    self.one(TokKind::Invalid)
                }
            }
            '!' => {
                if self.peek2() == Some('=') {
                    self.pos += 2;
                    TokKind::NotEq
                } else {
                    self.one(TokKind::Invalid)
                }
            }
            '<' => {
                if self.peek2() == Some('=') {
                    self.pos += 2;
                    TokKind::Le
                } else {
                    self.one(TokKind::Lt)
                }
            }
            '>' => {
                if self.peek2() == Some('=') {
                    self.pos += 2;
                    TokKind::Ge
                } else {
                    self.one(TokKind::Gt)
                }
            }
            _ => {
                if is_ident_start(c) {
                    self.lex_identifier()
                } else {
                    self.one(TokKind::Invalid)
                }
            }
        }
    }

    fn one(&mut self, kind: TokKind) -> TokKind {
        self.pos += 1;
        kind
    }

    /// `$[0-9]+ ("_" $[0-9]+)*`
    fn lex_int(&mut self) -> TokKind {
        while matches!(self.peek(), Some('0'..='9')) {
            self.pos += 1;
        }
        loop {
            if self.peek() == Some('_')
                && matches!(self.peek2(), Some('0'..='9'))
            {
                self.pos += 1;
                while matches!(self.peek(), Some('0'..='9')) {
                    self.pos += 1;
                }
            } else {
                break;
            }
        }
        TokKind::Int
    }

    /// Port of the external `identifierTokenizer` in tokens.ts, including the
    /// contextual `keywordD` behavior (e.g. `d4` → `d` + `4`, `d4d4` → one
    /// identifier, `(d1_000_000_000)` → `d` + `1_000_000_000`).
    fn lex_identifier(&mut self) -> TokKind {
        let tok_start = self.pos;

        // 根据有无前缀以及前缀是什么来确定是哪种标识符
        let mut prefixed = false;
        let mut external = false;
        match self.peek() {
            Some('$') => {
                self.pos += 1;
                prefixed = true;
            }
            Some('@') => {
                self.pos += 1;
                external = true;
                prefixed = true;
                // `@@(<...>)` or `@_(<...>)`
                if matches!(self.peek(), Some('@' | '_')) {
                    self.pos += 1;
                }
            }
            _ => {}
        }
        if self.peek().is_none() {
            // 不能只有前缀
            return TokKind::Invalid;
        }

        let first = self.peek().unwrap();
        let d_case = !prefixed && first == 'd';
        if d_case {
            self.pos += 1;
        } else if is_ident_start(first) {
            self.pos += 1;
        } else {
            return TokKind::Invalid;
        }

        let mut rest_count: u32 = 0;
        let mut rest_is_number = true;
        let mut last_is_underscore = true; // 或者还没开始
        while let Some(c) = self.peek() {
            if !is_ident_continue(c) {
                break;
            }
            rest_count += 1;
            if rest_is_number {
                if !c.is_ascii_digit() {
                    if !last_is_underscore && c == '_' {
                        last_is_underscore = true;
                    } else {
                        rest_is_number = false;
                    }
                } else {
                    last_is_underscore = false;
                }
            }
            self.pos += 1;
        }
        if rest_count > 0 && last_is_underscore {
            rest_is_number = false;
        }

        // 允许以 “?” 结尾
        if self.peek() == Some('?') {
            self.pos += 1;
            rest_count += 1;
        }

        if d_case && rest_is_number {
            // 投骰子的 “d” 运算符: token is just `d`; digits are re-lexed.
            self.pos = tok_start + 1;
            return TokKind::KeywordD;
        }

        if rest_count == 0 && first == '_' {
            if !prefixed {
                return TokKind::Underscore; // “_”
            }
            // 不允许 “$_” 和 “@_”
            return TokKind::Invalid;
        }

        if external {
            TokKind::IdentExternal
        } else if prefixed {
            TokKind::IdentUser
        } else {
            TokKind::Ident
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds(src: &str) -> Vec<TokKind> {
        Lexer::new(src).lex_all().into_iter().map(|t| t.kind).collect()
    }

    #[test]
    fn half_width() {
        assert_eq!(to_half_width("foo（１＋１） ／／ ｂａｒ"), "foo(1+1) // bar");
        assert_eq!(to_half_width("１２３"), "123");
        // not converted (out of U+FF01..=U+FF5E):
        assert_eq!(to_half_width("。、"), "。、");
    }

    #[test]
    fn dice_lexing() {
        use TokKind::*;
        assert_eq!(kinds("d4"), [KeywordD, Int, Eof]);
        assert_eq!(kinds("3d10"), [Int, KeywordD, Int, Eof]);
        assert_eq!(kinds("d1_1"), [KeywordD, Int, Eof]);
        assert_eq!(kinds("(d1_000_000_000)"), [OpenParen, KeywordD, Int, CloseParen, Eof]);
        // `d4d4` 视为名为 “d4d4” 的标识符
        assert_eq!(kinds("d4d4"), [Ident, Eof]);
        assert_eq!(kinds("d4_"), [Ident, Eof]);
        assert_eq!(kinds("d4__4"), [Ident, Eof]);
        assert_eq!(kinds("d_4"), [Ident, Eof]);
        assert_eq!(kinds("d"), [KeywordD, Eof]);
        assert_eq!(kinds("d?"), [KeywordD, Invalid, Eof]);
        assert_eq!(kinds("dd"), [Ident, Eof]);
        assert_eq!(kinds("dnot"), [Ident, Eof]);
    }

    #[test]
    fn identifiers() {
        use TokKind::*;
        assert_eq!(kinds("foo?"), [Ident, Eof]);
        assert_eq!(kinds("foo??"), [Ident, Invalid, Eof]);
        assert_eq!(kinds("$x"), [IdentUser, Eof]);
        assert_eq!(kinds("@x"), [IdentExternal, Eof]);
        assert_eq!(kinds("@@x"), [IdentExternal, Eof]);
        assert_eq!(kinds("@_x"), [IdentExternal, Eof]);
        assert_eq!(kinds("_"), [Underscore, Eof]);
        assert_eq!(kinds("__"), [Ident, Eof]);
        assert_eq!(kinds("_x"), [Ident, Eof]);
        assert_eq!(kinds("$_"), [Invalid, Eof]);
        assert_eq!(kinds("@_"), [Invalid, Eof]);
        assert_eq!(kinds("@__"), [Invalid, Eof]);
        assert_eq!(kinds("$__"), [IdentUser, Eof]);
        assert_eq!(kinds("$"), [Invalid, Eof]);
        assert_eq!(kinds("@@"), [Invalid, Eof]);
        assert_eq!(kinds("参数"), [Ident, Eof]);
        assert_eq!(kinds("$参数"), [IdentUser, Eof]);
    }

    #[test]
    fn ints() {
        use TokKind::*;
        assert_eq!(kinds("1_000_000"), [Int, Eof]);
        assert_eq!(kinds("1_"), [Int, Underscore, Eof]);
        assert_eq!(kinds("1__1"), [Int, Ident, Eof]);
    }

    #[test]
    fn operators() {
        use TokKind::*;
        assert_eq!(
            kinds("** ^ * // % + - ~ # . |> | & == != < > <= >= /"),
            [
                StarStar, Caret, Star, SlashSlash, Percent, Plus, Minus, Tilde, Hash, Dot, Pipe,
                Bar, Amp, EqEq, NotEq, Lt, Gt, Le, Ge, Slash, Eof
            ]
        );
        assert_eq!(kinds("="), [Invalid, Eof]);
        assert_eq!(kinds("!"), [Invalid, Eof]);
    }
}
