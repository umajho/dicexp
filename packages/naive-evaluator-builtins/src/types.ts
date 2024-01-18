import { Scope } from "@dicexp/runtime/scopes";

export type ScopeExplicit<
  T extends { [ident: string]: any },
> = { [ident in keyof T]: Scope[keyof Scope] };
