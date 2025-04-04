import { Component, Show } from "solid-js";

import {
  AnkorWidgetDicexpProperties,
  ErrorAlert,
  registerCustomElementForAnkorWidgetDicexp,
} from "@rotext/solid-components";

import type * as I from "@dicexp/interface";

import { registerCustomElementForStepsRepresentation } from "@dicexp/solid-components/internal";

import { defaultEvaluatorProvider } from "../stores/evaluator-provider";
import { Loading } from "./ui/mod";

const BACKGROUND_COLOR = [0x1f, 0x1f, 0x1f, null];

registerCustomElementForStepsRepresentation("steps-representation");
registerCustomElementForAnkorWidgetDicexp("dicexp-result", {
  baseStyleProviders: [], // TODO!!!
  backgroundColor: BACKGROUND_COLOR,
  ErrorAlert,
  Loading,
  tagNameForStepsRepresentation: "steps-representation",
});
registerCustomElementForAnkorWidgetDicexp("dicexp-example", {
  baseStyleProviders: [], // TODO!!!
  backgroundColor: BACKGROUND_COLOR,
  evaluatorProvider: defaultEvaluatorProvider,
  ErrorAlert,
  Loading,
  tagNameForStepsRepresentation: "steps-representation",
});

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "steps-representation": { repr: I.Repr };
      "dicexp-result": AnkorWidgetDicexpProperties;
      "dicexp-example": Omit<AnkorWidgetDicexpProperties, "evaluation">;
    }
  }
}

// const StepsRepresentation: Component<{ repr: Repr }> = (props) => {
//   return <steps-representation {...props}></steps-representation>;
// };

export const DicexpResult: Component<AnkorWidgetDicexpProperties> = (props) => {
  return (
    <Show when={props.evaluation}>
      <dicexp-result {...props} />
    </Show>
  );
};
