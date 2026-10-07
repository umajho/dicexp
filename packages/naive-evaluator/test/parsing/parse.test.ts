import {
  defineParsingSuite,
  ParsingSuiteContext,
} from "@dicexp/test-utils-for-executing";

import { parse } from "../../src/parsing/mod";

const ctx: ParsingSuiteContext = {
  impl: "naive",
  parse,
};

defineParsingSuite(ctx);
