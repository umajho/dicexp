<template lang="pug">
async-json-viewer(:value="result.representation")
</template>

<script setup lang="ts">
import Skeleton from "../common/skeleton.vue";

import type { EvaluationResult } from "dicexp/internal";

defineProps<{
  result: EvaluationResult;
}>();

const AsyncJsonViewer = defineAsyncComponent({
  loader: () => import("vue-json-viewer"),
  loadingComponent: h("div", { class: "h-36" }, [h(Skeleton)]),
});
</script>
