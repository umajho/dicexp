import { Evaluator as IEvaluator } from "@dicexp/interface";

import { Evaluator, NewEvaluatorOptions } from "../internal";

const makeEvaluator = ((opts: NewEvaluatorOptions) => {
  return new Evaluator(opts);
}) satisfies ((opts: NewEvaluatorOptions) => IEvaluator);

export default makeEvaluator;
