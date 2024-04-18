import { createList } from "./impl/lists";
import { createCallable } from "./impl/callable";
import {
  createSequence,
  createSequence$sum,
  createSequenceTransformer,
} from "./impl/sequences";

export const createValue = {
  callable: createCallable,

  list: createList,

  sequence: createSequence,

  sequence$sum: createSequence$sum,

  sequenceTransformer: createSequenceTransformer,
};
