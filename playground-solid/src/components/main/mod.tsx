import { Component, Show } from "solid-js";

import { ControlPane } from "./control-pane";
import * as store from "../../stores/store";
import { ResultPane } from "./result-pane-for-single";

import { ExecutionResult } from "dicexp/internal";

export const Main: Component = () => {
  return (
    <main class="flex flex-col items-center gap-10">
      <ControlPane />

      <Show when={store.result().type === "single"}>
        <ResultPane
          result={(store.result() as { result: ExecutionResult }).result}
        />
      </Show>
    </main>
  );
};
