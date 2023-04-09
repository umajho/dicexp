<template lang="pug">
.border.border-gray-500(ref="containerRef")
</template>

<script setup lang="ts">
import { EditorView, minimalSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
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
  (e: "confirm"): void;
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
  const confirmByEnter = keymap.of([
    {
      key: "Enter",
      run: () => {
        emit("confirm");
        return true;
      },
    },
  ]);
  // FIXME: Codemirror 官网的 JavaScript 没有任何特殊处理就实现了此功能，问题出在哪里？
  const removeSymmetryCloseBracket = EditorView.updateListener.of((update) => {
    update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      // 若非仅是删除一个字符，退出处理
      if (toB - fromB !== 0 || toA - fromA !== 1) return;

      // 若删除的字符及之后的字符不是一组空的括号，退出处理
      const pair = update.startState.doc.sliceString(fromA, toA + 1);
      if (pair !== "()" && pair !== "[]") return;

      // 若非只是一个光标，退出处理
      const selection = update.startState.selection;
      const mainCursor = selection.main;
      const justMainCursor =
        selection.ranges.length === 1 && mainCursor.from === mainCursor.to;
      if (!justMainCursor) return;

      // 若光标不在删除的开括号后侧，退出处理
      if (mainCursor.from !== toA) return;

      const tr = update.state.update({
        changes: { from: fromB, to: fromB + 1, insert: "" },
      });
      view.dispatch(tr);
    });
  });
  const linting = linter((view) => {
    // 参考：https://discuss.codemirror.net/t/showing-syntax-errors/3111/6
    if (view.state.doc.line(1).text.trim() === "") return [];
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
      bracketMatching({ brackets: "()[]" }),
      closeBrackets(),
      oneDark,
      singleLine,
      sync,
      Prec.high(confirmByEnter),
      dicexp(),
      removeSymmetryCloseBracket,
      linting,
    ],
  });

  view = new EditorView({
    state,
    parent: containerRef.value!,
  });
});
</script>
