import { createList } from "./impl/lists";
import { createCallable } from "./impl/callable";
import {
  createStream$list,
  createStream$sum,
  createStreamTransformer,
} from "./impl/streams";

export const createValue = {
  callable: createCallable,

  list: createList,

  stream$list: createStream$list,

  stream$sum: createStream$sum,

  streamTransformer: createStreamTransformer,
};
