<template lang="pug">
.card.bg-base-100.shadow-xl(style="min-width: 80vw")
  .card-body.p-6
    .flex.justify-end
      //- 运行统计
      .flex.flex-col.text-xs.text-slate-500(v-if="report.ok || statis")
        div(v-if="statisText.samples")
          | 样本：
          span.font-mono {{ statisText.samples }}
          | {{ " 个" }}
        div(v-if="statisText.duration")
          | {{ report.stopped ? "" : "目前" }}用时：
          span.font-mono {{ statisText.duration }}
          | {{ " 秒" }}
        div(v-if="statisText.speed")
          | 平均效率：
          span.font-mono {{ statisText.speed }}
          | {{ " 个/秒" }}

    //- 报告
    template(v-if="report.error")
      .h-2
      //- TODO: 补全信息
      common-error-result-alert(
        :kind="errorDisplayInfo.kind",
        :error="report.error",
        :showsStack="errorDisplayInfo.showsStack"
      )

    template(v-if="hasData")
      .h-2
      .flex.justify-around.items-center.gap-2(class="flex-col md:flex-row") 
        batch-result-pane-bar-chart(
          class="w-[25rem] md:w-60 lg:w-80",
          :report="report.ok", v-model:highlighted="highlighted", :mode="'at-least'"
        )
          .text-xl ≥
        hr(class="md:hidden")
        batch-result-pane-bar-chart(
          class="w-[25rem] md:w-60 lg:w-80",
          :report="report.ok", v-model:highlighted="highlighted", :mode="'normal'"
        )
          .text-xl =
        hr(class="md:hidden")
        batch-result-pane-bar-chart(
          class="w-[25rem] md:w-60 lg:w-80",
          :report="report.ok", v-model:highlighted="highlighted", :mode="'at-most'"
        )
          .text-xl ≤
</template>

<script setup lang="ts">
import { getErrorDisplayInfo } from "@/misc";
import type { BatchReportForWorker } from "dicexp/internal";

const props = defineProps<{
  report: BatchReportForWorker;
}>();

const highlighted: Ref<number | null> = ref(null);

const statis = computed(() => {
  return props.report.statistics;
});
const timeConsumption = computed(() => {
  if (!statis.value) return null;
  return statis.value.now.ms - statis.value.start.ms;
});

const hasData = computed(() => {
  return (props.report.ok?.samples ?? 0) > 0
})

const numberFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const statisText = computed(() => {
  return {
    samples: props.report.ok?.samples.toLocaleString(),
    ...(timeConsumption.value
      ? { duration: numberFormat.format(timeConsumption.value / 1000) }
      : {}),
    ...(timeConsumption.value && props.report.ok
      ? {
        speed: numberFormat.format(
          (props.report.ok.samples / timeConsumption.value) * 1000
        ),
      }
      : {}),
  };
});

const errorDisplayInfo = computed(() => {
  if (!props.report.error) return null;
  return getErrorDisplayInfo(props.report.specialErrorType);
});
</script>
