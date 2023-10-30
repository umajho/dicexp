import { Unreachable } from "@dicexp/errors";
import { RuntimeError } from "../runtime-errors/mod";

/**
 * 提供向外部（比如包含自己的列表）告知错误的钩子的对象。
 */
export class ErrorBeacon {
  private _error: RuntimeError | null = null;
  get error() {
    return this._error;
  }
  comfirmsError() {
    return !!this.error;
  }

  hooks?: ((error: RuntimeError) => void)[];

  constructor(
    errorSetterReceiver: (setter: (error: RuntimeError) => void) => void,
  ) {
    errorSetterReceiver((error) => {
      if (this._error) throw new Unreachable("");
      this._error = error;
      this.hooks?.forEach((h) => h(error));
      delete this.hooks;
    });
  }

  addDisposableHook(hook: (error: RuntimeError) => void) {
    if (this._error) {
      hook(this._error);
    } else if (this.hooks) {
      this.hooks.push(hook);
    } else {
      this.hooks = [hook];
    }
  }
}
