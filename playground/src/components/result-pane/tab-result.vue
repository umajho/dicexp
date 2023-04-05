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
import { getErrorDisplayInfo } from "@/misc";
import type { EvaluationResultForWorker } from "dicexp/internal";

const props = defineProps<{
  result: EvaluationResultForWorker;
}>();

const errorDisplayInfo = computed(() => {
  if (!props.result.error) return null;
  return getErrorDisplayInfo(props.result.specialErrorType);
});
</script>
