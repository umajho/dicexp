import { Component, Show } from "solid-js";

import {
  ErrorAlert,
  getDefaultDicexpStyleProviders,
  registerCustomElementForRoWidgetDicexp,
  RoWidgetDicexpProperties,
} from "@rotext/solid-components";

import type { Repr } from "dicexp/internal";

import { registerCustomElementForStepsRepresentation } from "@dicexp/solid-components/internal";

import { Loading } from "./ui";

import DicexpEvaluatingWorker from "../workers/evaluation.worker?worker";

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
  evaluatorProvider: {
    default: () => {
      return new Promise(async (r) => {
        let manager!: any;
        manager =
          new (await import("@dicexp/evaluating-worker-manager/internal"))
            .EvaluatingWorkerManager(
            () => new DicexpEvaluatingWorker(),
            (ready) => ready && r(manager),
          );
      });
    },
  },
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
