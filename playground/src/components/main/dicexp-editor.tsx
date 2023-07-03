import { Component, createEffect, on, onMount } from "solid-js";

import { EditorView, minimalSetup } from "codemirror";
import { Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import {
  fixCloseBracketRemoving,
  onKey,
  singleLine,
  syntaxErrorLinter,
} from "../../code-mirror-extensions";

import { dicexp } from "@dicexp/codemirror-lang-dicexp";

const DicexpEditor: Component<
  {
    class?: string;
    doc: string;
    setDoc: (doc: string) => void;
    onSubmit: () => void;
  }
> = (
  props,
) => {
  let parentEl!: HTMLDivElement;
  let view: EditorView;

  let dispatchedBySelf = false, changedBySelf = false;
  createEffect(() => {
    const doc = props.doc;

    if (changedBySelf) {
      changedBySelf = false;
      return;
    }
    if (!view) return;

    dispatchedBySelf = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
    });
  });

  onMount(() => {
    const extSync = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (dispatchedBySelf) {
        dispatchedBySelf = false;
        return;
      }

      changedBySelf = true;
      props.setDoc(update.state.doc.toString());
    });

    view = new EditorView({
      doc: props.doc,
      extensions: [
        minimalSetup,
        EditorView.lineWrapping,
        bracketMatching(),
        closeBrackets(),
        oneDark,
        singleLine,
        extSync,
        Prec.high(onKey("Enter", () => props.onSubmit())),
        dicexp(),
        fixCloseBracketRemoving,
        syntaxErrorLinter,
      ],
      parent: parentEl,
    });
  });

  return <div ref={parentEl} class={`cm-parent ${props.class ?? ""}`} />;
};

export default DicexpEditor;
