<template lang="pug">
.flex.justify-center
  .card.bg-base-100.shadow-xl(style="width: min(80vw, 60rem)")
    .card-body.p-6
      .tabs
        .tab.tab-bordered(
          :class="currentTab === 'result' ? ['tab-active'] : []",
          @click="switchTab('result')"
        ) 结果
        .tab.tab-bordered(
          v-if="props.result.representation"
          :class="currentTab === 'representation' ? ['tab-active'] : []"
          @click="switchTab('representation')"
        ) 步骤展现（临时版本）

      .h-2

      keep-alive 
        component(:is="tabs[currentTab]", v-bind="{ result }")
</template>

<script setup lang="ts">
import type { EvaluationResult } from "dicexp/internal";

import ResultPaneTabResult from "./result-pane-tab-result.vue";
import ResultPaneTabRepresentation from "./result-pane-tab-representation.vue";

const props = defineProps<{
  result: EvaluationResult;
}>();

const tabs = {
  result: ResultPaneTabResult,
  representation: ResultPaneTabRepresentation,
};

const currentTab = ref("result");
watch(props, () => {
  if (!props.result.representation) {
    currentTab.value = "result";
  }
});
function switchTab(tabName: string) {
  currentTab.value = tabName;
}
</script>
