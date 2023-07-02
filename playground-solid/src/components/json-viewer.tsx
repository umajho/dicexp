import { Component } from "solid-js";

import "@alenaksu/json-viewer";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "json-viewer": { data: any };
    }
  }
}

const JsonViewer: Component<{ data: unknown }> = (props) => {
  return <json-viewer data={props.data}></json-viewer>;
};

export default JsonViewer;
