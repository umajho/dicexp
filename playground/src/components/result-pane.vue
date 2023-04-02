<template lang="pug">
.flex.justify-center
  .card.bg-base-100.shadow-xl(style="min-width: 80vw")
    .card-body.p-6
      .flex
        //- 标签页
        .tabs.flex-1
          .tab.tab-bordered(
            :class="currentTab === 'result' ? ['tab-active'] : []",
            @click="switchTab('result')"
          ) 结果
          .tab.tab-bordered(
            v-if="props.result.representation"
            :class="currentTab === 'representation' ? ['tab-active'] : []"
            @click="switchTab('representation')"
          ) 步骤展现（临时版本）

        //- 统计
        .flex-none.text-xs.text-slate-500(v-if="statis")  
          .grid.grid-cols-1
            div 运算耗时：{{statis.timeConsumption.ms}} 毫秒
            div(v-if="statis.calls !== undefined") 调用次数：{{ statis.calls  }} 次

      .h-2

      //- 标签页下内容
      keep-alive 
        component(:is="tabs[currentTab]", v-bind="{ result }")
</template>

<script setup lang="ts">
import type { EvaluationResultForWorker } from "dicexp/internal";

import ResultPaneTabResult from "./result-pane-tab-result.vue";
import ResultPaneTabRepresentation from "./result-pane-tab-representation.vue";

const props = defineProps<{
  result: EvaluationResultForWorker;
}>();

const statis = computed(() => {
  return props.result?.statistics;
});

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
