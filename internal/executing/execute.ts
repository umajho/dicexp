import { XORWow } from "npm:random-seedable@1";
import { Node } from "../parsing/building_blocks.ts";
import { parse } from "../parsing/parse.ts";
import { Runtime, RuntimeOptions } from "./runtime.ts";

export function execute(node: string | Node, opts?: RuntimeOptions) {
  if (!opts) {
    opts = {
      random: new XORWow(),
    };
  }

  if (typeof node == "string") {
    node = parse(node);
  }

  return (new Runtime(node, opts)).executeAndTranslate();
}
