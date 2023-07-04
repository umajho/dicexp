import { Component, createEffect, createMemo, JSX, on, Show } from "solid-js";

export const ShowKeepAlive: Component<
  { when: () => boolean; children: JSX.Element }
> = (props) => {
  const when = createMemo(props.when);

  let loaded = false;
  createEffect(on(when, () => when() && (loaded = true)));

  return (
    <Show
      when={when() || loaded}
    >
      <div class={when() ? "" : "hidden"}>
        {props.children}
      </div>
    </Show>
  );
};
