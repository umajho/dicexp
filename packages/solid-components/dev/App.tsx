import type { Component } from "solid-js";

import { Repr } from "@dicexp/interface";

import styles from "./App.module.css";

import { registerCustomElementForStepsRepresentation } from "../src";

registerCustomElementForStepsRepresentation("steps-representation");

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
