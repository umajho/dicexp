import { Component } from "solid-js";

import { registerCustomElementForStepRepresentations } from "@dicexp/solid-components";
import type { Repr } from "dicexp/internal";

registerCustomElementForStepRepresentations("step-representations");

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "step-representations": { repr: Repr };
    }
  }
}

const StepsRepresentation: Component<{ repr: Repr }> = (props) => {
  return <step-representations {...props}></step-representations>;
};

export default StepsRepresentation;
