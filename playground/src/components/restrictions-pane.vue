<template lang="pug">
label.btn.btn-info.btn-sm.normal-case(for="restrictions-pane-modal") {{ restrictionsText }}

input#restrictions-pane-modal.modal-toggle(type="checkbox")
.modal
  .modal-box
    .grid.grid-cols-1.gap-4
      h1.text-xl 单次限制
      .grid.grid-cols-1
        common-optional-number-input(v-model="hardTimeoutValue" v-model:enabled="hardTimeoutEnabled")
          span(title="超过后强制停止，无法保留运行时信息。") 硬性超时（毫秒）
        .flex.justify-center
          div.text-xs.text-gray-400 （硬性超时在批量模式下不生效）
      common-optional-number-input(v-model="softTimeoutValue" v-model:enabled="softTimeoutEnabled")
        span(title="运行时尝试在超过后停止，保留运行时信息。") 软性超时（毫秒）
      common-optional-number-input(v-model="maxCallsValue" v-model:enabled="maxCallsEnabled")
        //- 偷个懒
        span(title="直接或间接地调用通常函数、闭包或捕获都会计入。") {{ "　　" }} 最多调用次数
      //- common-optional-number-input(v-model="maxClosureCallDepthValue" v-model:enabled="maxClosureCallDepthEnabled")
      //-   | 最大闭包调用深度

    .modal-action
      label.btn(for="restrictions-pane-modal") 确定
</template>

<script setup lang="ts">
import type { EvaluationRestrictionsForWorker } from "dicexp/internal";

const props = defineProps<{
  mode: "single" | "batch";
}>();

const emit = defineEmits<{
  (e: "update:restrictions", r: EvaluationRestrictionsForWorker | null): void;
}>();

const restrictionsText = ref("");

const hardTimeoutValue = ref(100);
const hardTimeoutEnabled = ref(true);

const softTimeoutValue = ref(50);
const softTimeoutEnabled = ref(false);

const maxCallsValue = ref(2000);
const maxCallsEnabled = ref(false);

const maxClosureCallDepthValue = ref(200);
// const maxClosureCallDepthEnabled = ref(true);
const maxClosureCallDepthEnabled: Ref<false> = ref(false); // ref(true);

const restrictions = computed((): EvaluationRestrictionsForWorker | null => {
  const r: EvaluationRestrictionsForWorker = {
    ...(hardTimeoutEnabled.value
      ? { hardTimeout: { ms: hardTimeoutValue.value } }
      : {}),
    execute: {
      ...(softTimeoutEnabled.value
        ? { softTimeout: { ms: softTimeoutValue.value } }
        : {}),
      ...(maxCallsEnabled.value ? { maxCalls: maxCallsValue.value } : {}),
      // ...(maxClosureCallDepthEnabled.value
      //   ? { maxClosureCallDepth: maxClosureCallDepthValue.value }
      //   : {}),
    }
  };
  if (Object.keys(r).length === 0) return null;
  return r;
});

watch(
  [restrictions, props],
  () => {
    const items = [];
    if (props.mode === "single" && hardTimeoutEnabled.value) {
      items.push(`硬性超时=${hardTimeoutValue.value}ms`);
    }
    if (softTimeoutEnabled.value) {
      items.push(`软性超时=${softTimeoutValue.value}ms`);
    }
    if (maxCallsEnabled.value) {
      items.push(`调用次数=${maxCallsValue.value}`);
    }
    if (maxClosureCallDepthEnabled.value) {
      items.push(`最大闭包调用深度=${maxClosureCallDepthValue.value}`);
    }
    if (items.length) {
      restrictionsText.value = "单次限制：" + items.join("，");
    } else {
      restrictionsText.value = "无限制";
    }
    emit("update:restrictions", restrictions.value);
  },
  { immediate: true }
);
</script>
