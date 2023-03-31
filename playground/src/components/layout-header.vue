<template lang="pug">
n-space(vertical, justify="center", style="height: 100%")
  n-grid(:cols="2")
    n-gi
      n-space(vertical, justify="center", style="height: 100%; padding-left: 20px")
        n-space(justify="start")
          span(style="font-size: large") Dicexp Playground
    n-gi
      n-space(justify="end")
        n-menu(mode="horizontal", :options="menuOptions")
</template>

<script setup lang="ts">
import type { MenuOption } from "naive-ui";

const menuOptions: MenuOption[] = [
  {
    label: () =>
      h(
        "a",
        {
          href: "https://github.com/umajho/dicexp/blob/main/docs/Dicexp.md",
          target: "_blank",
        },
        "文档"
      ),
    key: "doc",
  },
  {
    label: () =>
      h(
        "a",
        { href: "https://github.com/umajho/dicexp", target: "_blank" },
        "代码仓库"
      ),
    key: "repo",
  },
];
</script>
