import { Unreachable } from "@dicexp/errors";

import { RuntimeError } from "../../runtime-errors/mod";
import { ValueBox } from "../../value-boxes/mod";
import { ErrorBeacon } from "../../internal/error-beacon";

import { Value_List } from "../types";

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

  readonly type = "list";

  private _errorBeacon!: ErrorBeacon;
  private _errorSetter!: (error: RuntimeError) => void;
  get errorBeacon() {
    return this._errorBeacon;
  }

  constructor(...underlying: ValueBox[]) {
    super(...underlying);

    if (!InternalValue_List.isCreating) return;

    this._errorBeacon = new ErrorBeacon((s) => this._errorSetter = s);

    for (const item of underlying) {
      if (this._errorBeacon.error) break;
      if (item.confirmsError()) {
        const itemResult = item.get();
        if (itemResult[0] !== "error") throw new Unreachable();
        this._errorSetter(itemResult[1]);
      } else if (item.errorBeacon) {
        item.errorBeacon.addDisposableHook((err) => this._errorSetter(err));
      }
    }
  }
}
