<template lang="pug">
.flex.justify-center
  .card.bg-base-100.shadow-xl(style="min-width: 80vw")
    .card-body.p-6
      .flex
        .flex-1
        //- 运行统计
        .flex-none.text-xs.text-slate-500(v-if="ok || statis")
          .grid.grid-cols-1
            div(v-if="ok") 样本：{{ ok.samples }} 个
            div(v-if="statis") 目前用时：{{ (timeConsumption / 1000).toFixed(3) }} 秒
            div(v-if="ok && statis") 平均效率：{{ (ok.samples / timeConsumption * 1000).toFixed(3) }} 个/秒

      .h2

      //- 报告
      template(v-if="report.error")
        //- TODO: 补全信息
        common-error-result-alert(
          :kind="''",
          :error="report.error",
          :showsStack="true"
        )

      .h2(v-if="report.error && report.ok")

      template(v-if="report.ok")
        div {{ report.ok.counts }}
</template>

<script setup lang="ts">
import type { BatchReport } from "dicexp/internal";

const props = defineProps<{
  report: BatchReport;
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
</script>
