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
  NSkeleton,
  NSpin,
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
              style="
                display: flex;
                flex-direction: column;
                justify-content: center;
                height: 100%;
                min-width: 400px;
                width: 40vw;
              "
            >
              <async-dicexp-editor v-model="code"></async-dicexp-editor>
            </div>

            <template v-if="evaluate">
              <n-button @click="roll()">ROLL!</n-button>
            </template>
            <template v-else>
              <n-spin :size="20">
                <n-button disabled>ROLL!</n-button>
              </n-spin>
            </template>
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
import type { ExecutionResult, evaluate as evaluateFn } from "dicexp/internal";

import { defineAsyncComponent, h, ref, watch, type Ref } from "vue";

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

let evaluate: Ref<typeof evaluateFn | undefined> = ref(undefined);
(async () => {
  evaluate.value = (await import("dicexp/internal")).evaluate;
})();

const code = ref(localStorage.getItem("autosave") ?? "");
watch(code, () => {
  localStorage.setItem("autosave", code.value);
});

const result: Ref<ExecutionResult | null> = ref(null);
const otherError: Ref<Error | null> = ref(null);

function roll() {
  otherError.value = null;
  result.value = null;
  try {
    result.value = evaluate.value!(code.value);
  } catch (e) {
    if (e instanceof Error) {
      otherError.value = e;
    } else {
      otherError.value = new Error(`未知错误：${e}`);
    }
  }
}

const AsyncDicexpEditor = defineAsyncComponent({
  loader: () => import("./components/dicexp-editor.vue"),
  loadingComponent: h(NSkeleton, { size: "small" }),
});
</script>

<style scoped>
.container {
  --header-height: 40px;
  /* --footer-height: 2em; */
  --footer-height: 0px;
}
</style>
