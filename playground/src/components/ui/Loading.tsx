import { Component } from "solid-js";

const Loading: Component<{ type?: "spinner" | "bars"; size?: "lg" }> = (
  props,
) => {
  const classes = () =>
    [
      `loading-${props.type ?? "spinner"}` satisfies
        | "loading-spinner"
        | "loading-bars",
      props.size ? `loading-${props.size}` : "" satisfies
        | ""
        | "loading-lg",
    ].join(" ");

  return <span class={`loading ${classes()}`}></span>;
};

export default Loading;
