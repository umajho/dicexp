<template lang="pug">
.alert.alert-error.shadow-lg.overflow-scroll
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
import type { RuntimeError } from "dicexp/internal";

const props = defineProps<{
  kind: string;
  error: Error | RuntimeError;
  showsStack: boolean;
}>();
</script>
