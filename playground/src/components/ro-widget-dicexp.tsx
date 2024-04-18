import { Component, Show } from "solid-js";

import {
  ErrorAlert,
  getDefaultDicexpStyleProviders,
  registerCustomElementForRoWidgetDicexp,
  RoWidgetDicexpProperties,
} from "@rotext/solid-components";

import type { Repr } from "@dicexp/interface";

import { registerCustomElementForStepsRepresentation } from "@dicexp/solid-components/internal";

import { defaultEvaluatorProvider } from "../stores/evaluator-provider";
import { Loading } from "./ui/mod";

export const WIDGET_OWNER_CLASS = "widget-owner";

const BACKGROUND_COLOR = [0x1f, 0x1f, 0x1f, null];

registerCustomElementForStepsRepresentation("steps-representation");
registerCustomElementForRoWidgetDicexp("dicexp-result", {
  styleProviders: getDefaultDicexpStyleProviders(),
  backgroundColor: BACKGROUND_COLOR,
  widgetOwnerClass: WIDGET_OWNER_CLASS,
  ErrorAlert: ErrorAlert,
  Loading,
  tagNameForStepsRepresentation: "steps-representation",
});
registerCustomElementForRoWidgetDicexp("dicexp-example", {
  styleProviders: getDefaultDicexpStyleProviders(),
  backgroundColor: BACKGROUND_COLOR,
  widgetOwnerClass: WIDGET_OWNER_CLASS,
  evaluatorProvider: defaultEvaluatorProvider,
  ErrorAlert: ErrorAlert,
  Loading,
  tagNameForStepsRepresentation: "steps-representation",
});

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "steps-representation": { repr: Repr };
      "dicexp-result": RoWidgetDicexpProperties;
      "dicexp-example": Omit<RoWidgetDicexpProperties, "evaluation">;
    }
  }
}

// const StepsRepresentation: Component<{ repr: Repr }> = (props) => {
//   return <steps-representation {...props}></steps-representation>;
// };

export const DicexpResult: Component<RoWidgetDicexpProperties> = (props) => {
  return (
    <Show when={props.evaluation}>
      <dicexp-result {...props} />
    </Show>
  );
};
