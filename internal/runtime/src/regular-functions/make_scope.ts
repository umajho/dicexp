import {
  RawScope,
  RegularFunctionAlias,
  Scope,
  ValueSpec,
} from "../values/mod";
import { RegularFunctionDeclaration } from "./types/mod";
import { makeFunction } from "./make_function";
import { Unreachable } from "@dicexp/errors";

export function makeScope(rawScope: RawScope): Scope {
  const opScope: Scope = {};

  for (const decl_ of rawScope.declarations) {
    const decl = decl_ as RegularFunctionDeclaration;
    const fullName = `${decl.name}/${decl.parameters.length}`;
    const argSpec = decl.parameters.map((param) =>
      param.type === "$lazy" ? "lazy" : param.type
    );
    const impl = rawScope.definitions[fullName];
    if (!impl) {
      // TypeScript 会根据声明检查定义与文档的类型，所以一般而言不会出这种问题，
      // 不过还是以防万一检查一下。
      throw new Unreachable(`未找到声明的通常函数 \`${fullName}\` 对应的定义`);
    }
    opScope[fullName] = makeFunction(argSpec as ValueSpec[], impl);
    if (decl.aliases) {
      for (const alias of decl.aliases) {
        const fullAlias = `${alias}/${decl.parameters.length}`;
        opScope[fullAlias] = new RegularFunctionAlias(fullName);
      }
    }
  }

  return opScope;
}

export function asScope(stuff: Scope | RawScope | (Scope | RawScope)[]): Scope {
  if (Array.isArray(stuff)) {
    let scope: Scope = {};
    for (const item of stuff) {
      scope = { ...scope, ...asScope(item) };
    }
    return scope;
  } else if ("isRawScope" in stuff && stuff.isRawScope === true) {
    return makeScope(stuff as RawScope);
  } else {
    return stuff as Scope;
  }
}
