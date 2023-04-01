<template lang="pug">
label.btn.btn-info.btn-sm.normal-case(for="restrictions-pane-modal") {{ restrictionsText }}

input#restrictions-pane-modal.modal-toggle(type="checkbox")
.modal
  .modal-box
    .grid.grid-cols-1.gap-4
      h1.text-xl 限制
      optional-number-input(v-model="timeoutValue" v-model:enabled="timeoutEnabled")
        | 软性超时（毫秒）
      optional-number-input(v-model="maxCallsValue" v-model:enabled="maxCallsEnabled")
        //- 偷个懒
        | {{ "　　" }} 最多调用次数

    .modal-action
      label.btn(for="restrictions-pane-modal") 确定
</template>

<script setup lang="ts">
import type { RuntimeRestrictions } from "dicexp/internal";

const emit = defineEmits<{
  (e: "update:restrictions", r: RuntimeRestrictions | null): void;
}>();

const restrictionsText = ref("");

const timeoutValue = ref(50);
const timeoutEnabled = ref(false);

const maxCallsValue = ref(2000);
const maxCallsEnabled = ref(false);

const restrictions = computed((): RuntimeRestrictions | null => {
  const r = {
    ...(timeoutEnabled.value
      ? { softTimeout: { ms: timeoutValue.value } }
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
      if (timeoutEnabled.value) {
        items.push(`软性超时=${timeoutValue.value}ms`);
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
