<template lang="pug">
template(v-if="result.error !== undefined")
  .alert.alert-error.shadow-lg.overflow-scroll
    div
      div
        .font-bold {{ `${errorDisplayInfo.kind}错误` }}
        .text-xs
          code(style="white-space: pre")
            | {{ result.error.message }}
            template(v-if="errorDisplayInfo.showsStack")
              hr
              | {{ result.error.stack }}
template(v-else)
  code.break-all {{ JSON.stringify(result.ok) }}
</template>

<script setup lang="ts">
import type { EvaluationResultForWorker } from "dicexp/internal";

const props = defineProps<{
  result: EvaluationResultForWorker;
}>();

const errorDisplayInfo = computed(() => {
  if (props.result.ok) return null;
  switch (props.result.specialErrorType) {
    case "parsing_error":
      return { kind: "解析", showsStack: false };
    case "runtime_error":
      return { kind: "运行时", showsStack: false };
    default:
      return { kind: "其他", showsStack: true };
  }
});
</script>
