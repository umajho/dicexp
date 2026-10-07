---
name: browser-debugging
description: Drive the desktop browser tools to smoke-test and debug the dicexp playground (or any web page) end-to-end — dev-server hygiene, harness constraints, page-side async polling, CodeMirror editing, shadow-DOM result widgets, and the playground's UI map. Use whenever a task needs real-browser verification of the playground (evaluate, sampling, benchmark mode) or scripted page interaction.
---

# Browser debugging / playground smoke tests

Hard-won playbook for driving the playground through the `browser.*`
tools. Everything here was learned by failing first — follow it and skip
the failure.

## 0. Dev-server hygiene (see also AGENTS.md §Shell & process hygiene)

- Start vite in **background mode**: `npx vite --port 5199 --strictPort`
  from `playground/`. Pick an uncommon port; check it is free first
  (`lsof -ti:5199`) and **kill by port when done**
  (`lsof -ti:5199 | xargs kill`).
- The playground needs `just build-nova-wasm` to have run (the worker
  fetches the wasm assets), and naive needs `just build-lezer`.

## 1. Harness constraints (the `execute` runtime)

- **No timers in the harness.** `setTimeout` does not exist inside
  `execute` code, and `await new Promise(() => {})` hangs the call until
  it's interrupted. Do waiting **page-side**: pass an async IIFE with
  `setTimeout`-based polling loops to `browser.evaluate`.
- Tool signatures: call `search({ query, namespace: "browser" })` first
  and copy the signature exactly — e.g. `browser.evaluate` takes
  `{ tabID, script }` (NOT `expression`). Always pass an explicit `tabID`
  from `browser.tabs.list()` / `tabs.open()`; focus does not select a
  tool target.
- `script` is an embedded string (max 100 KB): inside page-side string
  literals write `\\n` for a newline — a raw newline is a SyntaxError.

## 2. Inspecting the page

- Enumerate interactables by text, don't guess selectors:
  ```js
  const buttons = [...document.querySelectorAll("button")]
    .map(b => b.textContent.trim());
  const selects = [...document.querySelectorAll("select")]
    .map(s => [...s.options].map(o => o.textContent.trim()));
  ```
- **Result widgets (ankor) render in shadow DOM** — plain `textContent`
  sees only headers. Deep-text helper (reuse this):
  ```js
  const deepText = (root) => {
    const parts = [];
    const walk = (r) => {
      const tw = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      let n; while ((n = tw.nextNode())) parts.push(n.textContent);
      r.querySelectorAll("*").forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
    };
    walk(root);
    return parts.join(" ").replace(/\s+/g, " ");
  };
  ```
  Scope it to the card you care about (find the card by walking up from
  its `h2`), not `document.body` — the nav/docs contain decoy text.

## 3. Editing CodeMirror

- Focus `.cm-content`, then `document.execCommand("selectAll")` +
  `document.execCommand("insertText", false, code)`.
- **Settle delay: the Solid signal lags the DOM edit.** Wait ~300 ms
  after `insertText` before clicking anything that captures the doc
  (ROLL!, 开始测试), or the run uses the stale code.

## 4. Polling for outcomes

- Poll a **state transition**, never static text that merely contains
  your keyword (the benchmark help text contains 「一致」 — matching it
  fired before the run started). Good signals:
  - run finished: the `开始测试` button exists again (during a run it's
    `取消`), or a new timestamped result card appeared;
  - progress text: `naive 运行中 样本 N` / `nova 等待中`.
- Poll every 200–500 ms page-side with a generous iteration cap
  (benchmark runs over 10–20k samples take seconds per implementation).
- Result cards are `H2`s like `单次 2026/10/06 05:49:12.711` /
  `基准 …`; the benchmark outcome table contains
  `结果一致性： ✓ 结果一致（直方图完全相同）`, per-impl sample
  counts/times, and 加速比.

## 5. Playground UI map (as of v0.4)

- Tabs (real `<button>`s): `单次` / `抽样` / `基准`. Implementation
  selector: `naive` / `nova` buttons (hidden in benchmark mode, which
  always runs both, naive first). Single roll: `ROLL!`; sampling stop:
  `停止`; terminate: `终止`; benchmark: `开始测试` / `取消`.
- Benchmark presets live in a `<select>` (`选择预设…`); set `sel.value`
  and dispatch `new Event("change", { bubbles: true })`, then settle.
- Under nova, single-roll cards show 「步骤展示暂不支持 nova 实现」 —
  expected until repr lands (v0.9), not a bug.

## 6. Cleanup checklist

- Kill the dev server by port. Verify with `lsof -ti:PORT` → no output.
- Delete any scratch test files you created; `git status` should show
  only intended changes.
