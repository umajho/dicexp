import { ValueTypeName } from "./value_names";

export type ValueSpec =
  | "lazy"
  | ValueTypeName
  | "*"
  | Set<ValueTypeName>;
