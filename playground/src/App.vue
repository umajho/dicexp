<template lang="pug">
.container
  n-config-provider(:theme="darkTheme")
    //- 顶部导航栏
    n-layout-header(style="height: var(--header-height)")
      layout-header

    //- 内容
    n-layout-content
      main(style=`
        height: calc(100vh - var(--header-height) - var(--footer-height));
      `)
        n-grid(:cols="1", y-gap="10", style="width: 100%")
          //- 留空
          n-gi
            div(style="height: 30px")

          //- 输入框和按钮
          n-gi
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
          
          //- 基本的设置
          n-gi
            n-space(justify="center")
              n-space(vertical, justify="center", style="height: 100%")
                n-checkbox(v-model:checked="fixesSeed") 固定种子
              n-input-number(v-model:value="seed", :disabled="!fixesSeed", :precision="0")
        
          //- 留空
          n-gi
            div(style="height: 10px")

          //- 结果展现
          n-gi
            div(v-if="result")
              result-pane(:result="result")
</template>

<script setup lang="ts">
import { NSkeleton, darkTheme /** used */ } from "naive-ui";

import type { EvaluationResult, evaluate as evaluateFn } from "dicexp/internal";
import { ParsingError, RuntimeError } from "dicexp/internal";

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
  return (!fixesSeed.value || isSeedValid.value) && code.value.trim() !== "";
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
  if (!canRoll.value) return;

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
</script>

<style scoped>
.container {
  --header-height: 40px;
  /* --footer-height: 2em; */
  --footer-height: 0px;
}
</style>
