<script lang="ts">
import {
  NConfigProvider,
  darkTheme,
  NLayoutHeader,
  NLayoutContent,
  NSpace,
  NGrid,
  NGi,
  NMenu,
  type MenuOption,
  NButton,
  NCard,
  NAlert,
} from "naive-ui";
</script>

<template>
  <div class="container">
    <n-config-provider :theme="darkTheme">
      <n-layout-header style="height: var(--header-height)">
        <n-space vertical justify="center" style="height: 100%">
          <n-grid :cols="3">
            <n-gi></n-gi>
            <n-gi>
              <n-space vertical justify="center" style="height: 100%">
                <n-space justify="center">
                  <span style="font-size: large">Dicexp Playground</span>
                </n-space>
              </n-space>
            </n-gi>
            <n-gi>
              <n-space justify="end">
                <n-menu mode="horizontal" :options="menuOptions"></n-menu>
              </n-space>
            </n-gi>
          </n-grid>
        </n-space>
      </n-layout-header>

      <n-layout-content>
        <main
          style="
            height: calc(100vh - var(--header-height) - var(--footer-height));
          "
        >
          <div style="height: 40px"></div>

          <n-space justify="center">
            <div
              id="input-container"
              style="
                display: flex;
                flex-direction: column;
                justify-content: center;
                height: 100%;
                min-width: 400px;
                width: 40vw;
              "
            ></div>
            <n-button @click="roll()">ROLL!</n-button>
          </n-space>

          <div style="height: 40px"></div>

          <div v-if="result || otherError">
            <n-space justify="center">
              <n-card title="结果" style="width: 60vw; min-width: 600px">
                <template v-if="otherError || result!.runtimeError">
                  <template v-if="otherError">
                    <n-alert type="error" title="错误">
                      {{ otherError.name }}
                      <hr />
                      {{ otherError.message }}
                      <hr />
                      {{ otherError.stack }}
                    </n-alert>
                  </template>
                  <template v-else>
                    <n-alert type="error" title="Dicexp 运行时错误">
                      {{ result!.runtimeError!.message }}
                    </n-alert>
                  </template>
                </template>
                <template v-else>
                  {{ result!.value }}
                </template>
              </n-card>
            </n-space>
          </div>
        </main>
      </n-layout-content>
    </n-config-provider>
  </div>
</template>

<script setup lang="ts">
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { bracketMatching } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";

import { oneDark } from "@codemirror/theme-one-dark";

import { dicexp } from "@dicexp/codemirror-lang-dicexp";
import { type ExecutionResult, evaluate } from "dicexp";

import { h, onMounted, ref, type Ref } from "vue";

const menuOptions: MenuOption[] = [
  {
    label: () =>
      h(
        "a",
        { href: "https://github.com/umajho/dicexp", target: "_blank" },
        "Git Repo"
      ),
    key: "github",
  },
];

let view: EditorView;

onMounted(() => {
  const singleLine = EditorState.transactionFilter.of((tr) =>
    tr.newDoc.lines > 1 ? [] : tr
  );

  const state = EditorState.create({
    extensions: [
      minimalSetup,
      bracketMatching(),
      closeBrackets(),
      oneDark,
      singleLine,
      dicexp(),
    ],
  });

  view = new EditorView({
    state,
    parent: document.querySelector("#input-container")!,
  });
});

const result: Ref<ExecutionResult | null> = ref(null);
const otherError: Ref<Error | null> = ref(null);

function roll() {
  otherError.value = null;
  result.value = null;
  try {
    result.value = evaluate(view.state.doc.line(1).text);
  } catch (e) {
    if (e instanceof Error) {
      otherError.value = e;
    } else {
      otherError.value = new Error(`未知错误：${e}`);
    }
  }
}
</script>

<style scoped>
.container {
  --header-height: 40px;
  /* --footer-height: 2em; */
  --footer-height: 0px;
}
</style>
