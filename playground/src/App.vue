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
          //-.card-body
          .pt-4.p-8
            .grid.grid-cols-1.gap-4
              .flex.items-center
                //- 选择模式用的标签页
                .tabs.flex-1
                  .tab.tab-bordered.tab-lg.font-bold(
                    :class="mode === 'single' ? 'tab-active' : null"
                    @click="switchMode('single')"
                  ) 单次
                  .tab.tab-bordered.tab-lg.font-bold(
                    :class="mode === 'batch' ? 'tab-active' : null"
                    @click="switchMode('batch')"
                  ) 批量
                select.w-32(v-model="exmapleSelected")
                  option(:value="null" disabled) 查看示例
                  option(v-for="example in examples" :value="example")
                    | “{{ example.label }}” {{ example.code }}

              //- 输入框和按钮
              .flex.justify-center.gap-6
                .flex.flex-col.justify-center.h-full.w-full
                  async-dicexp-editor(v-model="code" @confirm="roll()")
                .btn.btn-primary.btn-disabled.loading(v-if="rollStatus === 'loading'")
                template(v-else-if="rollStatus === 'rolling'")
                  .btn.btn-error(v-if="rolling === 'rolling'" @click="terminate()") 终止
                  .btn.btn-secondary(v-else @click="stopBatching()") 停止
                .btn.btn-primary(
                  v-else @click="roll()" :class="rollStatus === 'ready' ? null : 'btn-disabled'"
                ) ROLL!

              //- 基本的设置
              .justify-center.gap-4(class="md:flex max-md:grid max-md:grid-cols-1 md:min-w-[36rem] max-md:min-w-[20rem] md:h-8")
                template(v-if="mode === 'single'")
                  .flex.flex-col.h-full.justify-center
                    common-optional-number-input(v-model="seed" v-model:enabled="fixesSeed") 固定种子
                  .flex.flex-col.h-full.justify-center(class="max-md:hidden") |
                .flex.flex-col.h-full.justify-center
                  restrictions-pane(@update:restrictions="onUpdateRestrictions" :mode="mode")

      //- 结果展现
      div(v-if="result")
        result-pane(:result="result")
      div(v-if="batchReport")
        batch-result-pane(:report="batchReport")
</template>

<script setup lang="ts">
import Skeleton from "./components/common/skeleton.vue";

import { Unreachable } from "@dicexp/errors";
import type {
  EvaluationResultForWorker,
  EvaluationRestrictionsForWorker,
  EvaluatingWorkerManager,
  BatchReport,
  EvaluateOptionsForWorker,
} from "dicexp/internal";

// TODO: 允许自行选择
const TOP_LEVEL_SCOPE_NAME:
  EvaluateOptionsForWorker["execute"]["topLevelScopeName"]
  = "standard"

const mode: Ref<"single" | "batch"> = ref("single");
function switchMode(newMode: "single" | "batch") {
  mode.value = newMode;
}

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

const examples = [
  { label: "范围随机", code: "10~20" },
  { label: "掷骰", code: "3d6+4" },
  { label: "生成列表", code: "3#(d10 * 2)" },
  { label: "通常函数的调用", code: "sort(10#d100)" },
  { label: "通常函数的调用（管道）", code: "10#d100 |> sort" },
  { label: "数组", code: "sum([1, 2, 3])" },
  { label: "匿名函数作为参数", code: String.raw`3#d10 |> map(\($x -> -$x))` },
  { label: "匿名函数作为参数（简写）", code: String.raw`3#d10 |> map \($x -> -$x)` },
  { label: "匿名函数的调用", code: String.raw`\(_ -> 42).(-d100)` },
  { label: "匿名函数的调用（管道）", code: String.raw`-d100 |> \(_ -> 42).()` },
  { label: "匿名函数的调用（嵌套）", code: String.raw`\($f -> $f.(-d100)).(\(_ -> 42))` },
  { label: "综合", code: String.raw`10#d100 |> filter \($x -> $x >= 50) |> sum` },
]

const exmapleSelected = ref(null as (typeof examples)[number] | null)
watch(exmapleSelected, () => {
  if (exmapleSelected.value) {
    code.value = exmapleSelected.value.code;
    exmapleSelected.value = null
  }
})

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

const rolling: Ref<false | "rolling" | "batching"> = ref(false);
const result: Ref<EvaluationResultForWorker | null> = ref(null);
const batchReport: Ref<BatchReport | null> = ref(null);
function resetResults() {
  result.value = null;
  batchReport.value = null;
}

async function roll() {
  if (rollStatus.value !== "ready") return;
  resetResults();

  if (mode.value === "single") {
    rolling.value = "rolling";

    if (!fixesSeed.value) {
      seed.value = crypto.getRandomValues(new Uint32Array(1))[0];
    }

    try {
      const opts: EvaluateOptionsForWorker = {
        execute: {
          topLevelScopeName: TOP_LEVEL_SCOPE_NAME,
          seed: seed.value,
        },
        restrictions: restrictions.value ?? undefined,
      };
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
  } else {
    if (mode.value !== "batch") throw new Unreachable();
    rolling.value = "batching";

    try {
      const opts: EvaluateOptionsForWorker = {
        execute: {
          topLevelScopeName: TOP_LEVEL_SCOPE_NAME,
          // seed 不生效
        },
        restrictions: restrictions.value ?? undefined,
      };
      await evaluatingWorkerManager.value!.batch(code.value, opts, (report) => {
        batchReport.value = report;
      });
    } catch (e) {
      if (!(e instanceof Error)) {
        e = new Error(`未知抛出：${e}`);
      }
      batchReport.value = { error: e as Error }; // FIXME: 保留原先的数据
    }
  }
  rolling.value = false;
}

function terminate() {
  evaluatingWorkerManager.value!.terminateClient();
}

function stopBatching() {
  evaluatingWorkerManager.value!.stopBatching();
}

const AsyncDicexpEditor = defineAsyncComponent({
  loader: () => import("./components/dicexp-editor.vue"),
  loadingComponent: h("div", { class: "h-8" }, [h(Skeleton)]),
});
</script>
