import type { Component } from "solid-js";

import type { Repr } from "dicexp/internal";

import styles from "./App.module.css";

import { registerCustomElementForStepRepresentations } from "../src";

registerCustomElementForStepRepresentations("steps-representation");

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "steps-representation": { repr: Repr };
    }
  }
}

const App: Component = () => {
  return (
    <div class={styles.App}>
      <header class={styles.header}>
        <steps-representation repr={["vp", 42]} />
      </header>
    </div>
  );
};

export default App;
