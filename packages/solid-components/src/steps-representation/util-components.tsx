import { Component, createEffect, createSignal, JSX, on, Show } from "solid-js";

export const ShowKeepAlive: Component<{
  when: boolean;
  fallback: JSX.Element;
  children: JSX.Element;
}> = (props) => {
  let [hasEverBeenExpanded, setHasEverBeenExpanded] = createSignal(props.when);
  createEffect(on([() => props.when], ([v]) => {
    if (v) {
      setHasEverBeenExpanded(true);
    }
  }));

  return (
    <Show when={hasEverBeenExpanded()} fallback={props.fallback}>
      <div style={{ display: (!props.when) ? "inherit" : "none" }}>
        {props.fallback}
      </div>
      <div style={{ display: props.when ? "inherit" : "none" }}>
        {props.children}
      </div>
    </Show>
  );
};
