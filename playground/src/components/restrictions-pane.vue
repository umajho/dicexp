<template lang="pug">
label.btn.btn-info.btn-sm.normal-case(for="restrictions-pane-modal") {{ restrictionsText }}

input#restrictions-pane-modal.modal-toggle(type="checkbox")
.modal
  .modal-box
    .grid.grid-cols-1.gap-4
      h1.text-xl 限制
      optional-number-input(v-model="hardTimeoutValue" v-model:enabled="hardTimeoutEnabled")
        | 硬性超时（毫秒）
      optional-number-input(v-model="softTimeoutValue" v-model:enabled="softTimeoutEnabled")
        | 软性超时（毫秒）
      optional-number-input(v-model="maxCallsValue" v-model:enabled="maxCallsEnabled")
        //- 偷个懒
        | {{ "　　" }} 最多调用次数

    .modal-action
      label.btn(for="restrictions-pane-modal") 确定
</template>

<script setup lang="ts">
import type { EvaluationRestrictionsForWorker } from "dicexp/internal";

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

const restrictions = computed((): EvaluationRestrictionsForWorker | null => {
  const r: EvaluationRestrictionsForWorker = {
    ...(hardTimeoutEnabled.value
      ? { hardTimeout: { ms: hardTimeoutValue.value } }
      : {}),
    ...(softTimeoutEnabled.value
      ? { softTimeout: { ms: softTimeoutValue.value } }
      : {}),
    ...(maxCallsEnabled.value ? { maxCalls: maxCallsValue.value } : {}),
  };
  if (Object.keys(r).length === 0) return null;
  return r;
});

watch(
  restrictions,
  () => {
    if (restrictions.value) {
      const items = [];
      if (hardTimeoutEnabled.value) {
        items.push(`硬性超时=${hardTimeoutValue.value}ms`);
      }
      if (softTimeoutEnabled.value) {
        items.push(`软性超时=${softTimeoutValue.value}ms`);
      }
      if (maxCallsEnabled.value) {
        items.push(`调用次数=${maxCallsValue.value}`);
      }
      restrictionsText.value = "限制：" + items.join("，");
    } else {
      restrictionsText.value = "无限制";
    }
    emit("update:restrictions", restrictions.value);
  },
  { immediate: true }
);
</script>
