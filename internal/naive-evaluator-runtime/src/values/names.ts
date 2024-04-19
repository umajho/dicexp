import { Unreachable } from "@dicexp/errors";
import type * as I from "@dicexp/interface";
import { localizeValueType } from "@dicexp/l10n";

import { Value } from "./types";

export function getValueTypeName(v: Value) {
  switch (typeof v) {
    case "number":
      return "integer";
    case "boolean":
      return "boolean";
    default:
      return v.type;
      throw new Unreachable();
  }
}

export type ValueTypeName = ReturnType<typeof getValueTypeName>;
((v: ValueTypeName): I.ValueType => v); // 检查类型

export function getTypeDisplayName(name: ValueTypeName): string {
  return localizeValueType(name);
}

export function getValueTypeDisplayName(value: Value): string {
  return getTypeDisplayName(getValueTypeName(value));
}
