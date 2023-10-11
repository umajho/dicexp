import { Component } from "solid-js";

import { registerCustomElementForStepRepresentations } from "@dicexp/solid-components";
import type { Repr } from "dicexp/internal";

registerCustomElementForStepRepresentations("steps-representation");

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "steps-representation": { repr: Repr };
    }
  }
}

const StepsRepresentation: Component<{ repr: Repr }> = (props) => {
  return <steps-representation {...props}></steps-representation>;
};

export default StepsRepresentation;
