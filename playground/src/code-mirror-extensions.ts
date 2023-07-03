import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Diagnostic, linter } from "@codemirror/lint";

/**
 * 只允许单行。
 */
export const singleLine = EditorState.transactionFilter.of((tr) =>
  tr.newDoc.lines > 1 ? [] : tr
);

/**
 * 返回 “在按下回车时触发回调函数” 的扩展。
 */
export function onKey(key: "Enter", callback: (view: EditorView) => void) {
  return keymap.of([{
    key,
    run: (view) => {
      callback(view);
      return true;
    },
  }]);
}

/**
 * Codemirror 官网的 demo 有展示 “在空括号中删除开括号，会一同删除闭括号的功能”，
 * 但我不清楚改怎么配置成这样，所以就单独写一个扩展处实现这个好了。
 *
 * FIXME: 找到正确的配置方法。
 */
export const fixCloseBracketRemoving = EditorView.updateListener.of(
  (update) => {
    update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      // 若非仅是删除一个字符，退出处理
      if (toB - fromB !== 0 || toA - fromA !== 1) return;

      // 若删除的字符及之后的字符不是一组空的括号，退出处理
      const pair = update.startState.doc.sliceString(fromA, toA + 1);
      if (pair !== "()" && pair !== "[]") return;

      // 若非只是一个光标，退出处理
      const selection = update.startState.selection;
      const mainCursor = selection.main;
      const justMainCursor = selection.ranges.length === 1 &&
        mainCursor.from === mainCursor.to;
      if (!justMainCursor) return;

      // 若光标不在删除的开括号后侧，退出处理
      if (mainCursor.from !== toA) return;

      const tr = update.state.update({
        changes: { from: fromB, to: fromB + 1, insert: "" },
      });
      update.view.dispatch(tr);
    });
  },
);

/**
 * 简单实现一个指出语法错误的 linter。
 */
export const syntaxErrorLinter = linter((view) => {
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
