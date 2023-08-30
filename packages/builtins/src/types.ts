import { Scope } from "@dicexp/runtime/values";

export type ScopeExplicit<
  T extends { [ident: string]: any },
> = { [ident in keyof T]: Scope[keyof Scope] };
