<template lang="pug">
.app-container.min-h-screen.bg-base-300
  //- 顶部导航栏
  .absolute.z-10.w-full.p-2
    layout-header
    
  .h-32

  //- 内容
  main
    .grid.grid-cols-1.gap-10
      
      .flex.justify-center
        .card.bg-base-100.shadow-xl
          .card-body
            .grid.grid-cols-1.gap-4

              //- 输入框和按钮
              .flex.justify-center.gap-6
                .flex.flex-col.justify-center.h-full.w-full
                  async-dicexp-editor(v-model="code" @confirm="roll()")
                .btn.btn-primary(
                  @click="roll()",
                  :class="[evaluate ? null : 'loading', canRoll && evaluate ? null : 'btn-disabled']"
                ) ROLL!
              
              //- 基本的设置
              .justify-center.gap-4(class="md:flex max-md:grid max-md:grid-cols-1")
                .flex.flex-col.h-full.justify-center
                  optional-number-input(v-model="seed" v-model:enabled="fixesSeed") 固定种子
                .flex.flex-col.h-full.justify-center(class="max-md:hidden") |
                .flex.flex-col.h-full.justify-center
                  restrictions-pane(@update:restrictions="onUpdateRestrictions")
    
      //- 结果展现
      div(v-if="result")
        result-pane(:result="result")
</template>

<script setup lang="ts">
import Skeleton from "./components/skeleton.vue";

import type {
  EvaluationResult,
  evaluate as evaluateFn,
  RuntimeRestrictions,
} from "dicexp/internal";

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

const canRoll = computed(() => {
  if (code.value.trim() === "") return false;
  if (!fixesSeed.value) return true;
  return Number.isInteger(seed.value);
});

const restrictions: Ref<RuntimeRestrictions | null> = ref(null);
function onUpdateRestrictions(r: RuntimeRestrictions) {
  restrictions.value = r;
}

const result: Ref<EvaluationResult | null> = ref(null);

function roll() {
  if (!canRoll.value) return;

  if (!fixesSeed.value) {
    seed.value = crypto.getRandomValues(new Uint32Array(1))[0];
  }

  result.value = null;
  try {
    result.value = evaluate.value!(code.value, {
      seed: seed.value,
      restrictions: restrictions.value ?? undefined,
    });
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    result.value = { error: e as Error };
  }
}

const AsyncDicexpEditor = defineAsyncComponent({
  loader: () => import("./components/dicexp-editor.vue"),
  loadingComponent: h("div", { class: "h-8" }, [h(Skeleton)]),
});
</script>
