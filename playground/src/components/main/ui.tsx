import { Component, Show } from "solid-js";

import type * as I from "@dicexp/interface";

export const ErrorAlert: Component<{
  kind?: string;
  error: Error | I.RuntimeError;
  showsStack: boolean;
}> = (props) => {
  return (
    <div class="alert alert-error shadow-lg overflow-scroll">
      <div>
        <div class="font-bold">{props.kind}错误</div>
        <div class="text-xs">
          <code class="whitespace-pre">
            {props.error.message}
            <Show when={props.showsStack && (props.error as any)["stack"]}>
              <hr />
              {(props.error as any)["stack"]}
            </Show>
          </code>
        </div>
      </div>
    </div>
  );
};
