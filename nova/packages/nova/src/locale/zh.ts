/**
 * zh localization of structured nova errors — reproduces naive's exact
 * runtime messages. Keys: `nova/crates/nova-abi/src/lib.rs` (`error_key`).
 */

import type { DecodedError } from "../protocol";

export interface LocalizeContext {
  /** Source text (half-width-normalized), for span-rendering messages. */
  source?: string;
  /** Span for compile/parse errors (char indices). */
  span?: { start: number; end: number };
}

const VALUE_TYPE_NAMES = [
  /* 0 */ "整数",
  /* 1 */ "布尔",
  /* 2 */ "列表",
  /* 3 */ "可调用的",
  /* 4 */ "序列",
  /* 5 */ "求和序列",
] as const;

function typeName(t: number): string {
  return VALUE_TYPE_NAMES[t] ?? `未知（内部实现泄漏，${t}）`;
}

function typeSetName(mask: number): string {
  let out = "";
  for (let t = 0; t < 6; t++) {
    if (mask & (1 << t)) out += `「${typeName(t)}」`;
  }
  return out;
}

function intOf(err: DecodedError, i: number): number {
  const p = err.params[i];
  if (!p || p.tag !== 0) throw new Error(`error ${err.key}: param ${i} not int`);
  return p.int;
}

function strOf(err: DecodedError, i: number): string {
  const p = err.params[i];
  if (!p || p.tag !== 1) {
    throw new Error(`error ${err.key}: param ${i} not string`);
  }
  return p.str;
}

function valueTypeOf(err: DecodedError, i: number): number {
  const p = err.params[i];
  if (!p || p.tag !== 2) {
    throw new Error(`error ${err.key}: param ${i} not value type`);
  }
  return p.valueType;
}

function valueTypeSetOf(err: DecodedError, i: number): number {
  const p = err.params[i];
  if (!p || p.tag !== 3) {
    throw new Error(`error ${err.key}: param ${i} not value type set`);
  }
  return p.valueTypeSet;
}

export function localizeZh(err: DecodedError, ctx: LocalizeContext = {}): string {
  switch (err.key) {
    // --- runtime ---
    case 1:
      return `越过内在限制「最大安全整数」（允许 ${intOf(err, 0)}）`;
    case 2:
      return `越过内在限制「最小安全整数」（允许 ${intOf(err, 0)}）`;
    case 3:
      return `越过外加限制「运行时间」（允许 ${intOf(err, 0)} 毫秒）`;
    case 10:
    case 11:
    case 12: {
      const kind = err.key === 10
        ? "通常函数"
        : err.key === 11
        ? "闭包"
        : "被捕获的通常函数";
      return `尝试调用的${kind}期待 ${intOf(err, 0)} 个参数，` +
        `实际有 ${intOf(err, 1)} 个参数`;
    }
    case 20: {
      const expected = typeSetName(valueTypeSetOf(err, 0));
      const actual = typeName(valueTypeOf(err, 1));
      const kindText = intOf(err, 2) === 1 ? "（期待列表第一个元素的类型）" : "";
      return `期待类型${expected}与实际类型「${actual}」不符${kindText}`;
    }
    case 21: {
      const expected = typeSetName(valueTypeSetOf(err, 1));
      const actual = typeName(valueTypeOf(err, 2));
      return `调用的第 ${intOf(err, 0)} 个参数类型不匹配：` +
        `期待类型${expected}与实际类型「${actual}」不符`;
    }
    case 22:
      return "尝试调用不可被调用的值";
    case 23:
      return `「${typeName(valueTypeOf(err, 0))}」不能作为最终结果`;
    case 30:
      return `操作 “${strOf(err, 0)}” 非法：除数不能为零`;
    case 31:
      return `操作 “${strOf(err, 0)}” 非法：被除数不能为负数`;
    case 32:
      return `操作 “${strOf(err, 0)}” 非法：除数必须为正数`;
    case 33:
      return `操作 “${strOf(err, 0)}” 非法：指数不能为负数`;
    case 34:
      return `操作 “${strOf(err, 0)}” 非法：` +
        `范围上界（${intOf(err, 2)}）不能小于 ${intOf(err, 1)}`;
    case 40:
      return "内存不足：已达上限";
    case 42:
      return `操作 “${strOf(err, 0)}” 非法：两侧操作数的类型不相同`;
    case 43:
      return `访问列表越界：列表大小为 ${intOf(err, 0)}，` +
        `提供的索引为 ${intOf(err, 1)}`;
    case 44:
      return "列表为空";
    case 45:
      return "传入的列表存在非「数字」项";
    case 46:
      return "传入的列表存在非「布尔」项";
    case 47:
      return "传入的列表不支持排序";
    case 48:
      return `作为第 ${intOf(err, 0)} 个参数传入通常函数 ${strOf(err, 1)} ` +
        `的返回值类型与期待不符：` +
        `期待「${typeName(valueTypeOf(err, 2))}」，实际「${typeName(valueTypeOf(err, 3))}」。`;
    case 49:
      return `反复次数期待「整数」，实际类型为「${typeName(valueTypeOf(err, 0))}」`;
    case 50:
      return "传入的列表存在非「整数或布尔」项";
    case 51:
      return `传入 unfold/2 的闭包的返回值类型与期待不符：` +
        `期待「布尔」或含两个元素的列表，实际「${typeName(valueTypeOf(err, 0))}」。`;
    case 52:
      return `传入 unfold/2 的闭包返回的列表应含两个元素，` +
        `实际含 ${intOf(err, 0)} 个。`;

    // --- compile-time semantic errors ---
    case 1000:
      return `名为 \`${strOf(err, 0)}\` 的通常函数并不存在`;
    case 1001:
      return `名为 \`${strOf(err, 0)}\` 的变量并不存在`;
    case 1002:
      return `匿名函数存在重复的参数名 ${strOf(err, 0)}`;

    // --- parse errors ---
    case 2000: {
      if (ctx.source !== undefined && ctx.span) {
        // naive's exact convention (parse_error.ts `generalGrammar` renders
        // raw 0-based Lezer ⚠ from/to positions): the columns shown are the
        // span bounds themselves and the excerpt starts one char before the
        // span. At EOF the span is the empty range at the input end (as
        // naive's ⚠ is), so the excerpt shows the last character.
        const { start, end } = ctx.span;
        const slice = ctx.source.slice(start - 1, end);
        return `以下位置的语法有误：\n\t自列 ${start} 至列 ${end}：${slice}`;
      }
      return "语法错误";
    }
    case 2001:
      return "dicexp 仅支持整除，是否想用 “//” 整除运算符？";
    case 2002:
      return `整数字面量 ${strOf(err, 0)} 在整数的安全范围` +
        `（-9007199254740991 至 9007199254740991）之外`;
    case 2003:
      return "管道运算符右侧无法传入参数";
    default:
      return `未知错误（内部实现泄漏，错误键 ${err.key}）`;
  }
}
