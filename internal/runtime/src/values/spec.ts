import { ValueTypeName } from "./names";

export type ValueSpec =
  | "lazy"
  | ValueTypeName
  | "*"
  | Set<ValueTypeName>;
