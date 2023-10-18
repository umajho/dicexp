import { Component, Show } from "solid-js";

import type { Repr } from "dicexp/internal";

import { registerCustomElementForStepsRepresentation } from "@dicexp/solid-components/internal";
import {
  registerCustomElementForRoWidgetDicexp,
  RoWidgetDicexpProperties,
  withDefaultDicexpStyle,
} from "@rotext/solid-components";

import { Loading } from "./ui";
import { ErrorAlert } from "./main/ui";

export const WIDGET_OWNER_CLASS = "widget-owner";

const BACKGROUND_COLOR = [0x1f, 0x1f, 0x1f, null];

registerCustomElementForStepsRepresentation("steps-representation");
registerCustomElementForRoWidgetDicexp("dicexp-result", {
  withStyle: withDefaultDicexpStyle,
  backgroundColor: BACKGROUND_COLOR,
  widgetOwnerClass: WIDGET_OWNER_CLASS,
  ErrorAlert,
  Loading,
  tagNameForStepsRepresentation: "steps-representation",
});

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "steps-representation": { repr: Repr };
      "dicexp-result": RoWidgetDicexpProperties;
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
