<template>
  <div ref="containerRef"></div>
</template>

<script setup lang="ts">
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";

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

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      minimalSetup,
      bracketMatching(),
      closeBrackets(),
      oneDark,
      singleLine,
      sync,
      dicexp(),
    ],
  });

  view = new EditorView({
    state,
    parent: containerRef.value!,
  });
});
</script>
