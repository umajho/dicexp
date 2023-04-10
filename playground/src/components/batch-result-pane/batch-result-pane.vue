<template lang="pug">
.flex.justify-center
  .card.bg-base-100.shadow-xl(style="min-width: 80vw")
    .card-body.p-6
      .flex
        .flex-1
        //- 运行统计
        .flex-none.text-xs.text-slate-500(v-if="ok || statis")
          .grid.grid-cols-1
            div(v-if="statisText.samples")
              | 样本：
              span.font-mono {{ statisText.samples }}
              | {{ " 个" }}
            div(v-if="statisText.duration")
              | 目前用时：
              span.font-mono {{ statisText.duration }}
              | {{ " 秒" }}
            div(v-if="statisText.speed")
              | 平均效率：
              span.font-mono {{ statisText.speed }}
              | {{ " 个/秒" }}

      .h2

      //- 报告
      template(v-if="report.error")
        //- TODO: 补全信息
        common-error-result-alert(
          :kind="errorDisplayInfo.kind",
          :error="report.error",
          :showsStack="errorDisplayInfo.showsStack"
        )

      .h2(v-if="report.error && report.ok")

      template(v-if="report.ok")
        div {{ report.ok.counts }}
</template>

<script setup lang="ts">
import { getErrorDisplayInfo } from "@/misc";
import type { BatchReportForWorker } from "dicexp/internal";

const props = defineProps<{
  report: BatchReportForWorker;
}>();

const statis = computed(() => {
  return props.report.statistics;
});
const timeConsumption = computed(() => {
  if (!statis.value) return null;
  return statis.value.now.ms - statis.value.start.ms;
});

const ok = computed(() => {
  return props.report.ok;
});

const numberFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const statisText = computed(() => {
  return {
    samples: ok.value?.samples.toLocaleString(),
    ...(timeConsumption.value
      ? { duration: numberFormat.format(timeConsumption.value / 1000) }
      : {}),
    ...(timeConsumption.value && ok.value
      ? {
          speed: numberFormat.format(
            (ok.value.samples / timeConsumption.value) * 1000
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
