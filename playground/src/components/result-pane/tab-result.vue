<template lang="pug">
template(v-if="result.error !== undefined")
  common-error-result-alert(
    :kind="errorDisplayInfo.kind",
    :error="result.error",
    :showsStack="errorDisplayInfo.showsStack"
  )
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
