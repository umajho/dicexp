import { ErrorBeacon } from "../internal/error-beacon";
import { createRepr, ReprInRuntime } from "../repr/mod";
import { createRuntimeError, RuntimeError } from "../runtime-errors/mod";
import { Value, Value_Container, Value_Direct } from "../values/mod";

import { ValueBox } from "./ValueBox";

export class ValueBoxDircet extends ValueBox {
  constructor(
    private value: Value_Direct,
    private representation: ReprInRuntime,
  ) {
    super();
  }

  get(): ["ok", Value] {
    return ["ok", this.value];
  }
  confirmsError(): boolean {
    return false;
  }
  getRepr(): ReprInRuntime {
    return this.representation;
  }
}

export class ValueBoxContainer extends ValueBox {
  constructor(
    private value: Value_Container,
    private representation: ReprInRuntime,
  ) {
    super();
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    return this.errorBeacon?.error
      ? ["error", this.errorBeacon.error]
      : ["ok", this.value];
  }
  get errorBeacon() {
    return this.value.errorBeacon;
  }
  confirmsError(): boolean {
    return this.errorBeacon?.comfirmsError() ?? false;
  }
  getRepr(): ReprInRuntime {
    return this.representation;
  }
}

export class ValueBoxError extends ValueBox {
  private repr: ReprInRuntime;

  constructor(
    private error: RuntimeError,
    opts?: { indirect?: boolean; source?: ReprInRuntime },
  ) {
    super();

    this.repr = opts?.indirect
      ? (opts.source ?? createRepr.error_indirect())
      : createRepr.error(error, opts?.source);
  }

  get(): ["error", RuntimeError] {
    return ["error", this.error];
  }
  confirmsError(): boolean {
    return true;
  }
  getRepr(): ReprInRuntime {
    return this.repr;
  }
}

export class ValueBoxLazy extends ValueBox {
  memo?: [["ok", Value] | ["error", RuntimeError], ReprInRuntime];
  errorHooks?: ((err: RuntimeError) => void)[];

  private _errorBeacon: ErrorBeacon;
  private _errorSetter!: (error: RuntimeError) => void;
  get errorBeacon() {
    return this._errorBeacon;
  }

  constructor(
    private yielder?: () => ValueBox,
  ) {
    super();
    this._errorBeacon = new ErrorBeacon((s) => this._errorSetter = s);
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    if (!this.memo) {
      const valueBox = this.yielder!();
      delete this.yielder;
      const result = valueBox.get();
      this.memo = [result, valueBox.getRepr()];
      if (result[0] === "error") {
        this._errorSetter(result[1]);
      }
    }
    return this.memo[0];
  }
  confirmsError(): boolean {
    return this.errorBeacon.comfirmsError();
  }
  getRepr(): ReprInRuntime {
    if (this.memo) {
      return this.memo[1];
    }
    return createRepr.unevaluated();
  }
}

class ValueBoxUnevaluated extends ValueBox {
  get(): ["error", RuntimeError] {
    return ["error", createRuntimeError.simple("未求值（实现细节泄漏）")];
  }
  confirmsError(): boolean {
    return true;
  }
  getRepr(): ReprInRuntime {
    return createRepr.unevaluated();
  }
}
export const valueBoxUnevaluated = new ValueBoxUnevaluated();
