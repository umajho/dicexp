//! Compile-time semantic checks (plan §5, compat.md item 3): unknown regular
//! functions, unknown variables, duplicate closure parameters. All errors are
//! collected (pre-order), not just the first.

use std::collections::HashSet;

use dicexp_nova_abi::{error_key, find_builtin};

use crate::ast::{Node, Value};
use crate::error::CompileError;

pub fn check(root: &Node) -> Vec<CompileError> {
    let mut c = Checker { errors: Vec::new(), scopes: vec![Vec::new()] };
    c.walk(root);
    c.errors
}

struct Checker {
    errors: Vec<CompileError>,
    /// Lexical scope stack of closure parameter names (`_` included).
    scopes: Vec<Vec<String>>,
}

impl Checker {
    fn walk(&mut self, node: &Node) {
        match node {
            Node::Variable(name, span) => {
                if name.starts_with('$') {
                    if !self.resolvable(name) {
                        self.errors.push(CompileError::with_str(
                            error_key::UNKNOWN_VARIABLE,
                            *span,
                            name.clone(),
                        ));
                    }
                } else {
                    // Plain identifiers can never be bound in v0.1 (naive
                    // errors `unknownVariable` lazily at runtime; nova is
                    // eager, see compat.md). Same for `@…` externals.
                    self.errors.push(CompileError::with_str(
                        error_key::UNKNOWN_VARIABLE,
                        *span,
                        name.clone(),
                    ));
                }
            }
            Node::RegularCall { name, name_span, args, .. } => {
                if find_builtin(name, args.len() as u32).is_none() {
                    self.errors.push(CompileError::with_str(
                        error_key::UNKNOWN_REGULAR_FUNCTION,
                        *name_span,
                        format!("{name}/{arity}", arity = args.len()),
                    ));
                }
                for arg in args {
                    self.walk(arg);
                }
            }
            Node::ValueCall { variable, args, .. } => {
                // A value call of a known non-callable literal (e.g. `1.(2)`)
                // is NOT a compile error: runtime raises VALUE_IS_NOT_CALLABLE.
                self.walk(variable);
                for arg in args {
                    self.walk(arg);
                }
            }
            Node::Repetition { count, body, .. } => {
                self.walk(count);
                self.walk(body);
            }
            Node::Value(v, span) => match v {
                Value::Integer(_) | Value::Boolean(_) => {}
                Value::List(items) => {
                    for item in items {
                        self.walk(item);
                    }
                }
                Value::Closure { params, body } => {
                    let mut seen: HashSet<&str> = HashSet::new();
                    let mut reported: HashSet<&str> = HashSet::new();
                    for (name, pspan) in params {
                        if name == "_" {
                            continue; // `_` params are ignored and repeatable
                        }
                        if !seen.insert(name) && reported.insert(name) {
                            self.errors.push(CompileError::with_str(
                                error_key::DUPLICATE_CLOSURE_PARAMETER_NAMES,
                                *pspan,
                                name.clone(),
                            ));
                        }
                    }
                    self.scopes.push(params.iter().map(|(n, _)| n.clone()).collect());
                    self.walk(body);
                    self.scopes.pop();
                }
                Value::Captured { identifier, arity } => {
                    let found = u32::try_from(*arity)
                        .ok()
                        .and_then(|a| find_builtin(identifier, a));
                    if found.is_none() {
                        self.errors.push(CompileError::with_str(
                            error_key::UNKNOWN_REGULAR_FUNCTION,
                            *span,
                            format!("{identifier}/{arity}"),
                        ));
                    }
                }
            },
        }
    }

    fn resolvable(&self, name: &str) -> bool {
        self.scopes.iter().rev().any(|level| level.iter().any(|p| p == name))
    }
}
