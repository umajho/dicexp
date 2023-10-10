// 与 dicexp.grammar 中的 @precedence 保持同步，修改那里时记得更新这里

/**
 * 值越大，优先级越高。
 */
export const precedenceTable: Record<string, number> = {
  // diceRollUnary
  "d/1": 0,
  // diceRoll
  "d/2": -1,

  // call (`.`) 不算在内

  // not
  "not/1": -2,

  // exp
  // XXX: `^/2` 在解析时被替换（详见 dicexp.grammar 中的相关注释），因此不存在。
  "**/2": -3,

  // times
  "*/2": -4,
  "///2": -4,
  "%/2": -4,

  // negate
  "+/1": -5,
  "-/1": -5,
  // plus
  "+/2": -6,
  "-/2": -6,

  // rangeRollUnary
  "~/1": -7,
  // rangeRoll
  "~/2": -8,

  // repeat (`#`) 不算在内
  // pipe (`|>`) 不算在内

  // compare
  "</2": -9,
  ">/2": -9,
  "<=/2": -9,
  ">=/2": -9,

  // equal
  "==/2": -10,
  "!=/2": -10,

  // and
  "and/2": -11,

  // or
  "or/2": -12,
};
