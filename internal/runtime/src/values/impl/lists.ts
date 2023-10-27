import { Unreachable } from "@dicexp/errors";

import {
  DisposableErrorHookable,
  RuntimeError,
  Value_List,
  ValueBox,
} from "../mod";

export function createList(underlying: ValueBox[]): Value_List {
  InternalValue_List.isCreating = true;
  const v = new InternalValue_List(...underlying);
  InternalValue_List.isCreating = false;
  return v;
}

class InternalValue_List extends Array<ValueBox> implements Value_List {
  /**
   * 之前尝试用 Proxy 实现 `Value_List`，但是开销太大了，故还是决定换成现在的继承 Array 来
   * 实现。
   * 由于 JavaScript 在调用 map 之类的方法时，创建新数组用的是继承后的 constructor，这里
   * 通过 `isCreating` 这个 workaround 来确定创建者的来源。其为 false 代表来源并非
   * `createValue` 工厂，这时不会有任何多余的逻辑。
   */
  static isCreating = false;

  type!: "list";

  private confirmedError?: RuntimeError | null = null;
  private errorHooks?: ((err: RuntimeError) => void)[];

  constructor(...underlying: ValueBox[]) {
    super(...underlying);

    if (!InternalValue_List.isCreating) return;

    this.type = "list";
    this.confirmedError = null;

    const setComfirmedError = (err: RuntimeError) => {
      this.confirmedError = err;
      this.errorHooks?.forEach((hook) => hook(err));
      delete this.errorHooks;
    };

    for (const item of underlying) {
      if (this.confirmedError) break;
      if (item.confirmsError()) {
        const itemResult = item.get();
        if (itemResult[0] !== "error") throw new Unreachable();
        setComfirmedError(itemResult[1]);
      } else if ("addDisposableErrorHook" in item) {
        (item as DisposableErrorHookable)
          .addDisposableErrorHook((err) => setComfirmedError(err));
      }
    }
  }

  /**
   * 在确定有错误时，以该错误为参数调用 hook。
   */
  addDisposableErrorHook(hook: (err: RuntimeError) => void): void {
    if (this.confirmedError) {
      hook(this.confirmedError);
    } else if (this.errorHooks) {
      this.errorHooks.push(hook);
    } else {
      this.errorHooks = [hook];
    }
  }

  confirmsThatContainsError(): boolean {
    return !!this.confirmedError;
  }
}
