import { Component } from "solid-js";

import { registerCustomElementForStepsRepresentation } from "@dicexp/solid-components/internal";
import type { Repr } from "dicexp/internal";

registerCustomElementForStepsRepresentation("steps-representation");

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
