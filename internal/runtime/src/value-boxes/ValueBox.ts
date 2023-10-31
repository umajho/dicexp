import { ReprInRuntime } from "@dicexp/interface";

import { ErrorBeacon } from "../internal/error-beacon";
import { RuntimeError } from "../runtime-errors/mod";
import { Value } from "../values/mod";

export abstract class ValueBox {
  /**
   * 获取其中的值。对于惰性的 ValueBox 而言，在此时才求值。
   */
  abstract get(): ["ok", Value] | ["error", RuntimeError];
  /**
   * 是否确定存在错误。
   */
  abstract confirmsError(): boolean;
  get errorBeacon(): ErrorBeacon | undefined {
    return undefined;
  }
  abstract getRepr(): ReprInRuntime;
}
