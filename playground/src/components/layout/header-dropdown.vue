<template lang="pug">
.dropdown
  label.btn.btn-ghost(ref="labelEl" tabindex="0")
    | 团岛计划
    ChevronDownIcon.w-4.h-4
  ul.dropdown-content(ref="ulEl" tabindex="0" class="z-[1] menu p-2 shadow bg-base-100 rounded-box border-[0.5px] border-black")
    li
      a(href="https://umajho.github.io/rotext") 轻量级标记语言 Rotext
      a 骰子表达式 Dicexp（当前）
</template>

<script setup lang="ts">
import { ChevronDownIcon } from '@heroicons/vue/24/solid'

const labelEl: Ref<HTMLElement | null> = ref(null)
const ulEl: Ref<HTMLElement | null> = ref(null)

onMounted(() => {
  let isOpen = false;
  window.addEventListener("click", (ev) => {
    if (!isOpen) {
      if (ev.target === labelEl.value) {
        isOpen = true;
      }
      return;
    }
    labelEl.value!.blur();
    ulEl.value!.blur();
    isOpen = false;
  }, { capture: true });
})
</script>
