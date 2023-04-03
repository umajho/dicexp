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
                .btn.btn-primary.btn-disabled.loading(v-if="rollStatus === 'loading'")
                .btn.btn-primary.btn-error(
                  v-else-if="rollStatus === 'rolling'" @click="terminate()"
                ) 终止
                .btn.btn-primary(
                  v-else @click="roll()" :class="rollStatus === 'ready' ? null : 'btn-disabled'"
                ) ROLL!
              
              //- 基本的设置
              .justify-center.gap-4(class="md:flex max-md:grid max-md:grid-cols-1")
                .flex.flex-col.h-full.justify-center
                  common-optional-number-input(v-model="seed" v-model:enabled="fixesSeed") 固定种子
                .flex.flex-col.h-full.justify-center(class="max-md:hidden") |
                .flex.flex-col.h-full.justify-center
                  restrictions-pane(@update:restrictions="onUpdateRestrictions")
    
      //- 结果展现
      div(v-if="result")
        result-pane(:result="result")
</template>

<script setup lang="ts">
import Skeleton from "./components/common/skeleton.vue";

import type {
  EvaluationResultForWorker,
  EvaluationRestrictionsForWorker,
  EvaluatingWorkerManager,
} from "dicexp/internal";

const evaluatingWorkerManager: Ref<EvaluatingWorkerManager | undefined> =
  ref(undefined);
const evaluatingWorkerManagerReady = ref(false);
(async () => {
  const dicexp = await import("dicexp/internal");
  const manager = new dicexp.EvaluatingWorkerManager((ready) => {
    evaluatingWorkerManagerReady.value = ready;
  });
  evaluatingWorkerManager.value = manager;
})();

const code = ref(localStorage.getItem("autosave") ?? "");
watch(code, () => {
  localStorage.setItem("autosave", code.value);
});

const fixesSeed = ref(false);
const seed = ref(0);

const rollStatus = computed(() => {
  if (!evaluatingWorkerManagerReady.value) return "loading";
  if (rolling.value) return "rolling";
  if (inputValid.value) return "ready";
  return "invalid";
});

const inputValid = computed(() => {
  if (code.value.trim() === "") return false;
  if (!fixesSeed.value) return true;
  return Number.isInteger(seed.value);
});

const restrictions: Ref<EvaluationRestrictionsForWorker | null> = ref(null);
function onUpdateRestrictions(r: EvaluationRestrictionsForWorker) {
  restrictions.value = r;
}

const rolling = ref(false);
const result: Ref<EvaluationResultForWorker | null> = ref(null);

async function roll() {
  if (rollStatus.value !== "ready") return;
  rolling.value = true;

  if (!fixesSeed.value) {
    seed.value = crypto.getRandomValues(new Uint32Array(1))[0];
  }

  result.value = null;
  try {
    // 深度去除 reactivity
    const opts = JSON.parse(
      JSON.stringify({
        seed: seed.value,
        restrictions: restrictions.value ?? undefined,
      })
    );
    result.value = await evaluatingWorkerManager.value!.evaluate(
      code.value,
      opts
    );
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    result.value = { error: e as Error };
  }

  rolling.value = false;
}

function terminate() {
  evaluatingWorkerManager.value!.terminateClient();
}

const AsyncDicexpEditor = defineAsyncComponent({
  loader: () => import("./components/dicexp-editor.vue"),
  loadingComponent: h("div", { class: "h-8" }, [h(Skeleton)]),
});
</script>
