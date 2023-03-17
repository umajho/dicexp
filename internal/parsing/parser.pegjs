// 也许会有帮助：
// https://peggyjs.org/online.html
// https://peggyjs.org/documentation.html
// https://stackoverflow.com/q/24174714

{{
  import {
    captured,
    closure,
    list,
    regularCall,
    valueCall,
  } from "./building_blocks.ts";
  import { negateInteger, parseBoolean, parseInteger } from "./parse.ts";

  function buildBinaryOperator(head, tail) {
    return tail.reduce((left, el) => {
      return regularCall("operator", el[1], [left, el[3]]);
    }, head);
  }

  function buildPipeOperator(head, tail) {
    return tail.reduce((left, el) => {
      let right = el[3];
      if (typeof right === "string") {
        right = regularCall("function", right, []);
      }
      return regularCall("operator", el[1], [left, right]);
    }, head);
  }

  function buildCallOperator(head, tail) {
    return tail.reduce((left, el) => {
      return valueCall(left, el[3]);
    }, head);
  }

  function buildUnaryOperator(op, exp) {
    return regularCall("operator", op, [exp]);
  }
}}

Expression
  = _ @BinaryOperator$10 _

BinaryOperator$10
  = head:BinaryOperator$11 tail:(_ "||" _ BinaryOperator$11)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$11
  = head:BinaryOperator$20 tail:(_ "&&" _ BinaryOperator$20)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$20
  = head:BinaryOperator$21 tail:(_ ("==" / "!=") _ BinaryOperator$21)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$21
  = head:BinaryOperator$30 tail:(_ ("<=" / ">=" / "<" / ">") _ BinaryOperator$30)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$30
  = head:BinaryOperator$40 tail:(_ "|>" _ BinaryOperator$40)*
    { return buildPipeOperator(head, tail); }

BinaryOperator$40
  = head:BinaryOperator$50 tail:(_ "#" _ BinaryOperator$50)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$50
  = head:UnaryOperator$51 tail:(_ "~" _ UnaryOperator$51)*
  { return buildBinaryOperator(head, tail); }

UnaryOperator$51
  = op:"~" _ exp:BinaryOperator$60
    { return buildUnaryOperator(op, exp); }
  / BinaryOperator$60

BinaryOperator$60
  = head:UnaryOperator$61 tail:(_ ("+" / "-") _ UnaryOperator$61)*
    { return buildBinaryOperator(head, tail); }

UnaryOperator$61
  = op:("+" / "-") _ exp:BinaryOperator$62
    { return buildUnaryOperator(op, exp); }
  / BinaryOperator$62

BinaryOperator$62
  = head:BinaryOperator$80 tail:(_ ("*" / "//" / "%") _ BinaryOperator$80)*
    { return buildBinaryOperator(head, tail); }

BinaryOperator$80
  = head:UnaryOperator$100 tail:(_ "^" _ UnaryOperator$100)*
    { return buildBinaryOperator(head, tail); }

UnaryOperator$100
  = op:("~" / "+" / "-" / "!") _ exp:BinaryOperator$Call
    { return buildUnaryOperator(op, exp); }
  / BinaryOperator$Call

BinaryOperator$Call
  = head:BinaryOperator$210 tail:(_ "." _ ArgumentList)*
    { return buildCallOperator(head, tail); }

BinaryOperator$210
  = head:RollGroupingBefore last:(_ ("d%" / "d") _ RollGroupingAfter)
    { return buildBinaryOperator(head, [last]); }
  / UnaryOperator$211

UnaryOperator$211
  = op:("d%" / "d") _ exp:RollGroupingAfter
    { return buildUnaryOperator(op, exp); }
  / Grouping

RollGroupingBefore
  = "(" @Expression ")"
  / @LiteralInteger

RollGroupingAfter
  = RollGroupingBefore
  / "+" int:LiteralInteger
    { return int; }
  / "-" int:LiteralInteger
    { return negateInteger(int); }

Grouping
  = "(" @Expression ")"
  / Call
  / List
  / Closure
  / Capture
  / Ident
  / Literal

Call "通常函数调用"
  = ident:FunctionIdent _ args:ArgumentList
    { return regularCall("function", ident, args); }
  / ident:FunctionIdent _ closure:Closure
    { return regularCall("function", ident, [closure]); }

ArgumentList "参数列表" = "(" @Expression|.., ","| ")"

List "列表"
  = "[" exps:Expression|.., ","| "]"
    { return list(exps) }

Closure "闭包"
  = "\\(" _ idents:Ident|.., _ "," _ | _ "->" body:Expression ")"
    { return closure(idents, body); }

Capture "通常函数捕获"
  = "&" ident:Ident "/" arity:LiteralInteger
    { return captured(ident, Number(arity)); }
  / "&" ident:UnarySymbol "/" "1"
    { return captured(ident, 1); }
  / "&" ident:BinarySymbol "/" "2"
    { return captured(ident, 2); }

UnarySymbol "单目运算符" = $("-" / "!" / "~" / "d" / "d%")
BinarySymbol "双目运算符" = $(
    "||" / "&&" / "==" / "!=" / "<=" / ">=" / "<" / ">" / 
    // “|>” 和 “#” 比较特殊，会改变代码结构，因此不允许被捕获
    "~" / "+" / "-" / "*" / "//" / "%" /
    "d%" / "d" /
    "^"
  )

FunctionIdent "函数标识符" = $(BaseIdent [!?]?)

// 单独的 “d” 是运算符，不能用作标识符
Ident "标识符" = @id:BaseIdent &{ return ["d", "true", "false"].indexOf(id) === -1; }
BaseIdent = $(IdentHead IdentRestChar*)
IdentHead = $("_" / [a-zA-Z])
IdentRestChar = $(IdentHead / [0-9])

Literal
  = LiteralInteger
  / LiteralBoolean

LiteralInteger "整数常量"
  = value:$([0-9] ([0-9_])*) !{ return value.at(-1) === "_" }
    { return parseInteger(value); }

LiteralBoolean "布尔值常量"
  = value:("true" / "false")
    { return parseBoolean(value); }

_ "空白"
  = [ \t\n\r]*