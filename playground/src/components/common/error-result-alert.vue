<template lang="pug">
.alert.alert-error.shadow-lg.overflow-scroll
  div
    div
      .font-bold {{ `${props.kind}错误` }}
      .text-xs
        code(style="white-space: pre")
          | {{ props.error.message }}
          template(v-if="props.showsStack")
            hr
            | {{ props.error.stack }}
</template>

<script setup lang="ts">
const props = defineProps<{
  kind: string;
  error: Error;
  showsStack: boolean;
}>();
</script>
