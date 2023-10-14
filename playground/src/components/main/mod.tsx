import { Component, Show } from "solid-js";

import { ControlPane } from "./control-pane";
import * as store from "../../stores/store";
import { ResultPaneForSingle } from "./result-pane-for-single";

import {
  BatchReportForWorker,
  EvaluationResultForWorker,
} from "@dicexp/evaluating-worker-manager/internal";
import { ResultPaneForBatch } from "./result-pane-for-batch";
import { DocumentationPane } from "./documentation-pane";

export const Main: Component = () => {
  return (
    <main class="flex flex-col items-center gap-10">
      <ControlPane />

      <Show when={store.result().type === "single"}>
        <ResultPaneForSingle
          result={(store.result() as { result: EvaluationResultForWorker })
            .result}
        />
      </Show>

      <Show when={store.result().type === "batch"}>
        <ResultPaneForBatch
          report={(store.result() as { report: BatchReportForWorker }).report}
        />
      </Show>

      <DocumentationPane />
    </main>
  );
};
