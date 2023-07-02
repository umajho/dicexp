<template lang="pug">
.flex.justify-center.items-center.gap-2
  .flex.flex-col.h-full.justify-center
    .form-control
      .label.cursor-pointer
        span.label-text
          slot
        span.w-2
        input.checkbox(type="checkbox", v-model="enabled")
  .flex.flex-col.h-full.justify-center
    input.input.input-bordered.input-sm(
      type="number",
      v-model="value"
      :disabled="!enabled"
    )
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  enabled: boolean;
}>();

const value = ref(props.modelValue);
const enabled = ref(props.enabled);
watch(value, () => emit("update:modelValue", value.value));
watch(enabled, () => emit("update:enabled", enabled.value));
watch(props, () => {
  value.value = props.modelValue;
  enabled.value = props.enabled;
});

const emit = defineEmits<{
  (e: "update:modelValue", value: Number): void;
  (e: "update:enabled", value: boolean): void;
}>();
</script>
