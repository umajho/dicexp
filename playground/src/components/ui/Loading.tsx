import { Component } from "solid-js";

import {
  createStyleProviderFromCSSText,
  ShadowRootAttacher,
} from "@rolludejo/internal-web-shared";

import styles from "./Loading.scss?inline";

const styleProvider = createStyleProviderFromCSSText(styles);

const Loading: Component<{ type?: "spinner" | "bars"; size?: "lg" }> = (
  props,
) => {
  const classes = () =>
    [
      (props.type ?? "spinner") satisfies
        | "spinner"
        | "bars",
      (props.size ?? "") satisfies
        | ""
        | "lg",
    ].join(" ");

  return (
    <ShadowRootAttacher styleProviders={[styleProvider]}>
      <span class={`loading-indicator ${classes()}`}></span>
    </ShadowRootAttacher>
  );
};

export default Loading;
