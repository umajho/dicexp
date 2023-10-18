import { Component } from "solid-js";

import { ControlPane } from "./control-pane";
import * as store from "../../stores/store";
import { ResultPane } from "./result-pane";

import { DocumentationPane } from "./documentation-pane";

export const Main: Component = () => {
  return (
    <main class="flex flex-col items-center gap-10">
      <ControlPane />

      <ResultPane records={store.records} />

      <DocumentationPane />
    </main>
  );
};
