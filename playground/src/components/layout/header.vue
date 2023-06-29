<template lang="pug">
.navbar.bg-base-100.shadow-xl.rounded-box
  .flex-1
    HeaderDropdown
    a.btn.btn-ghost.normal-case.text-xl Dicexp Playground
  .flex-none
    ul.menu.menu-horizontal.px-1
      li
        a.inline-flex.items-center(
          href="https://github.com/umajho/dicexp/blob/main/docs/Dicexp.md",
          target="_blank"
        )
          | 文档
          ArrowTopRightOnSquareIcon.w-4.h-4
      li
        a.inline-flex.items-center(
          href="https://github.com/umajho/dicexp",
          target="_blank"
        ) 
          | 代码仓库
          ArrowTopRightOnSquareIcon.w-4.h-4
</template>

<script setup lang="ts">
import HeaderDropdown from "./header-dropdown.vue"

import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/solid'
</script> 