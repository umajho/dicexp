<template lang="pug">
n-space(justify="center")
  n-card(style="width: 60vw; min-width: 600px")
    n-tabs(type="line" v-model:value="currentTab")
      n-tab-pane(name="result", tab="结果")
        template(v-if="result.error !== undefined")
          n-alert(type="error", :title="`${errorDisplayInfo.kind}错误`")
            code(style="white-space: pre")
              | {{ result.error.message }}
              template(v-if="errorDisplayInfo.showsStack")
                hr
                | {{ result.error.stack }}
        template(v-else)
          code(style="white-space: pre-wrap") {{ JSON.stringify(result.ok) }}
      n-tab-pane(v-if="result && result.representation", name="representation", tab="步骤展现（临时版本）")
        async-json-viewer(:value="result.representation")
</template>

<script setup lang="ts">
import { NSkeleton } from "naive-ui";

import type { EvaluationResult } from "dicexp/internal";

const props = defineProps<{
  result: EvaluationResult;
}>();

const currentTab = ref("result");
watch(props.result, () => {
  if (!props.result.representation) {
    currentTab.value = "result";
  }
});

const AsyncJsonViewer = defineAsyncComponent({
  loader: () => import("vue-json-viewer"),
  loadingComponent: h(NSkeleton, { size: "large" }),
});
</script>
