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
import type { EvaluationResult } from "dicexp/internal";
import { ParsingError, RuntimeError } from "dicexp/internal";

const props = defineProps<{
  result: EvaluationResult;
}>();

const errorDisplayInfo = computed(() => {
  if (props.result.ok) return null;
  const err = props.result.error!;
  if (err instanceof ParsingError) return { kind: "解析", showsStack: false };
  if (err instanceof RuntimeError) return { kind: "运行时", showsStack: false };
  return { kind: "未知", showsStack: true };
});
</script>
