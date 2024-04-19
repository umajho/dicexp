import type * as I from "@dicexp/interface";

import { Evaluator, NewEvaluatorOptions } from "../internal";

const makeEvaluator = ((opts: NewEvaluatorOptions) => {
  return new Evaluator(opts);
}) satisfies ((opts: NewEvaluatorOptions) => I.Evaluator);

export default makeEvaluator;
