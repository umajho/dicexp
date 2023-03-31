<template lang="pug">
.container
  n-config-provider(:theme="darkTheme")
    n-layout-header(style="height: var(--header-height)")
      n-space(vertical, justify="center", style="height: 100%")
        n-grid(:cols="2")
          n-gi
            n-space(vertical, justify="center", style="height: 100%; padding-left: 20px")
              n-space(justify="start")
                span(style="font-size: large") Dicexp Playground
          n-gi
            n-space(justify="end")
              n-menu(mode="horizontal", :options="menuOptions")
    n-layout-content
      main(style=`
        height: calc(100vh - var(--header-height) - var(--footer-height));
      `)
        div(style="height: 40px")
        n-grid(:cols="1", y-gap="10", style="width: 100%")
          n-gi(style="width: 100%")
            n-space(justify="center")
              div(style=`
                display: flex;
                flex-direction: column;
                justify-content: center;
                height: 100%;
                width: min(60vw, 512px);
              `)
                async-dicexp-editor(v-model="code" @confirm="roll()")
              template(v-if="evaluate")
                n-button(@click="roll()", :disabled="!canRoll") ROLL!
              template(v-else)
                n-spin(:size="20")
                  n-button(disabled) ROLL!
          n-gi
            n-space(justify="center")
              n-space(vertical, justify="center", style="height: 100%")
                n-checkbox(v-model:checked="fixesSeed") 固定种子
              n-input-number(v-model:value="seed", :disabled="!fixesSeed", :precision="0")
        div(style="height: 40px")
        div(v-if="result")
          n-space(justify="center")
            n-card(style="width: 60vw; min-width: 600px")
              n-tabs(type="line")
                n-tab-pane(name="result", tab="结果")
                  template(v-if="result.error")
                    n-alert(type="error", :title="`${errorDisplayInfo.kind}错误`")
                      code(style="white-space: pre")
                        | {{ result.error.message }}
                        template(v-if="errorDisplayInfo.showsStack")
                          hr
                          | {{ result.error.stack }}
                  template(v-else)
                    code(style="white-space: pre-wrap") {{ JSON.stringify(result.ok) }}
                n-tab-pane(v-if="result && result.representation", name="representation", tab="步骤展现（临时版本）")
                  async-json-viewer(:value="result.representation")
</template>

<script setup lang="ts">
import { type MenuOption, NSkeleton, darkTheme /** used */ } from "naive-ui";

import type { EvaluationResult, evaluate as evaluateFn } from "dicexp/internal";
import { ParsingError, RuntimeError } from "dicexp/internal";

const menuOptions: MenuOption[] = [
  {
    label: () =>
      h(
        "a",
        {
          href: "https://github.com/umajho/dicexp/blob/main/docs/Dicexp.md",
          target: "_blank",
        },
        "文档"
      ),
    key: "doc",
  },
  {
    label: () =>
      h(
        "a",
        { href: "https://github.com/umajho/dicexp", target: "_blank" },
        "代码仓库"
      ),
    key: "repo",
  },
];

const evaluate: Ref<typeof evaluateFn | undefined> = ref(undefined);
(async () => {
  evaluate.value = (await import("dicexp/internal")).evaluate;
})();

const code = ref(localStorage.getItem("autosave") ?? "");
watch(code, () => {
  localStorage.setItem("autosave", code.value);
});

const fixesSeed = ref(false);
const seed = ref(0);
const isSeedValid = computed(() => {
  return Number.isInteger(seed.value);
});

const canRoll = computed(() => {
  return (!fixesSeed.value || isSeedValid.value) && code.value.slice() !== "";
});

const result: Ref<EvaluationResult | null> = ref(null);
const errorDisplayInfo = computed(() => {
  if (!result.value || result.value.ok) return null;
  const err = result.value.error!;
  if (err instanceof ParsingError) return { kind: "解析", showsStack: false };
  if (err instanceof RuntimeError) return { kind: "运行时", showsStack: false };
  return { kind: "未知", showsStack: true };
});

function roll() {
  if (!canRoll) return;

  if (!fixesSeed.value) {
    seed.value = crypto.getRandomValues(new Uint32Array(1))[0];
  }

  result.value = null;
  try {
    result.value = evaluate.value!(code.value, { seed: seed.value });
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    result.value = { error: e as Error, representation: null };
  }
}

const AsyncDicexpEditor = defineAsyncComponent({
  loader: () => import("./components/dicexp-editor.vue"),
  loadingComponent: h(NSkeleton, { size: "small" }),
});
const AsyncJsonViewer = defineAsyncComponent({
  loader: () => import("vue-json-viewer"),
  loadingComponent: h(NSkeleton, { size: "large" }),
});
</script>

<style scoped>
.container {
  --header-height: 40px;
  /* --footer-height: 2em; */
  --footer-height: 0px;
}
</style>
