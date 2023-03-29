<template>
  <div ref="containerRef"></div>
</template>

<script setup lang="ts">
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { bracketMatching, syntaxTree } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { linter, type Diagnostic } from "@codemirror/lint";

import { oneDark } from "@codemirror/theme-one-dark";

import { dicexp } from "@dicexp/codemirror-lang-dicexp";

const containerRef: Ref<HTMLElement | null> = ref(null);

const props = defineProps<{
  modelValue: string;
}>();
const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

let view: EditorView;

onMounted(() => {
  const singleLine = EditorState.transactionFilter.of((tr) =>
    tr.newDoc.lines > 1 ? [] : tr
  );
  const sync = EditorView.updateListener.of(() => {
    const value = view.state.doc.line(1).text;
    emit("update:modelValue", value);
  });
  const linting = linter((view) => {
    // 参考：https://discuss.codemirror.net/t/showing-syntax-errors/3111/6
    if (view.state.doc.line(1).text.slice() === "") return [];
    const diagnostics: Diagnostic[] = [];
    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name === "⚠") {
          diagnostics.push({
            from: node.from,
            to: node.to,
            severity: "error",
            message: "语法有误。",
          });
        }
      },
    });
    return diagnostics;
  });

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      minimalSetup,
      EditorView.lineWrapping,
      bracketMatching(),
      closeBrackets(),
      oneDark,
      singleLine,
      sync,
      dicexp(),
      linting,
    ],
  });

  view = new EditorView({
    state,
    parent: containerRef.value!,
  });
});
</script>
