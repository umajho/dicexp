import type { RuntimeError } from "./runtime_errors";
import type { RuntimeRepresentation } from "./representations";

export type RuntimeResult<OkType> =
  | { ok: OkType }
  | { error: RuntimeError };

export interface LazyValue {
  /**
   * 对于结果本身不变的或者被固定下来的 LazyValue 而言，固定的值会记录在这里。
   */
  memo?: Concrete | false;
  /**
   * 用于求其值的函数，如果已经有 memo 则可以不存在。
   */
  _yield?: () => Concrete | { lazy: LazyValue };

  /**
   * 是否已经固定下来。
   * 会考虑 memo 是列表时，列表内部（包括嵌套）的值是否也固定下来了。
   */
  stabilized?: true;

  /**
   * 是否被其他其他的 LazyValue 替代。（用于步骤展现。）
   */
  replacedBy?: LazyValue;

  /**
   * 固定成了哪些 Concrete。（用于步骤展现。）
   */
  stabilizedAs?: Concrete[];
}

export type LazyValueWithMemo = LazyValue & {
  memo: Concrete;
};

export interface Concrete {
  value: RuntimeResult<Value>;
  volatile: boolean;
  representation: RuntimeRepresentation;
}

export type Value =
  | number
  | boolean
  | Value_List
  | Value_Callable;

export type Value_List = LazyValue[];

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: LazyValue[]) => RuntimeResult<LazyValue>;

  representation: RuntimeRepresentation;
}
