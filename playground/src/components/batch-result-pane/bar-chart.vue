<template lang="pug">
svg(v-once, ref="svgEl")
  svg:style(type="text/css").
    .highlighting rect {
      opacity: 40%;
    }
    rect.highlighted {
      opacity: unset;
    }

teleport(to="body")
  div.absolute(v-once, ref="tooltipEl")
</template>

<script setup lang="ts">
import * as d3 from "d3";
import type { BatchReport } from "dicexp/internal";

const svgEl: Ref<SVGElement | null> = ref(null);
const tooltipEl: Ref<HTMLDivElement | null> = ref(null);

const props = defineProps<{
  report: NonNullable<BatchReport["ok"]>;
}>();

type DatumForD3 = {
  resultNumber: number;
  count: unknown;
  portion: number;
};
const data: ComputedRef<DatumForD3[]> = computed(() => {
  return Object.entries(props.report.counts) //
    .map(([key, value]) => ({
      resultNumber: Number(key),
      count: value,
      portion: value / props.report.samples,
    }));
});

onMounted(() => {
  const graphWidth = 320,
    graphHeight = 320,
    paddingBetween = 1.2,
    axisXHeight = 20,
    axisYWidth = 40;

  const chartWidth = graphWidth + axisYWidth,
    chartHeight = graphHeight + axisXHeight;

  // 可参考：
  // - https://observablehq.com/@d3/learn-d3-joins
  // - https://www.d3indepth.com/axes/
  // - https://d3-graph-gallery.com/graph/interactivity_tooltip.html
  const svg = d3
    .select(svgEl.value!) //
    .attr("width", chartWidth)
    .attr("height", chartHeight)
    .attr("viewBox", [0, 0, chartWidth, chartHeight]);

  let bar: d3.Selection<d3.BaseType, DatumForD3, SVGGElement, unknown> = svg
    .append("g") //
    .attr("fill", "steelblue")
    .attr("transform", `translate(${axisYWidth}, 0)`)
    .selectAll("rect");

  let axisX = svg
    .append("g")
    .attr("transform", `translate(${axisYWidth}, ${graphHeight})`);
  let axisY = svg.append("g");

  const tooltip = d3
    .select(tooltipEl.value!)
    // .style("position", "absolute")
    .style("z-index", "10")
    .style("opacity", 0)
    .style("background-color", "white")
    .style("border", "solid")
    .style("border-width", "2px")
    .style("border-radius", "4px")
    .style("padding", "3px");

  watch(
    data,
    () => {
      const minNumber = d3.min(data.value, (d) => d.resultNumber)!,
        maxNumber = d3.max(data.value, (d) => d.resultNumber)!,
        maxPortion = d3.max(data.value, (d) => d.portion)!;

      const bars = maxNumber - minNumber + 1;
      const barRange = Array(bars)
        .fill(null)
        .map((_, i) => i);
      const barHeight = graphHeight / bars;

      const x = d3 // 横轴：几率
        .scaleLinear()
        .domain([0, maxPortion])
        .range([0, graphWidth]);

      axisX = axisX.call(
        d3
          .axisBottom(x)
          .ticks(10)
          .tickFormat((d) => ((d as number) * 100).toFixed() + "%")
      );

      const y = d3 // 纵轴：结果数字
        .scaleQuantize()
        .domain([minNumber, maxNumber])
        .range(barRange.map((i) => i * barHeight));

      axisY = axisY
        .call(d3.axisLeft(y))
        .attr(
          "transform",
          `translate(${axisYWidth}, ${(barHeight + paddingBetween) / 2})`
        );

      function setAttr(sel: any) {
        sel
          .attr("x", x(0))
          .attr("y", (d: DatumForD3) => y(d.resultNumber) + paddingBetween / 2) // 加 margin 时不要忘了该这里
          .attr("width", (d: DatumForD3) => x(d.portion) - x(0))
          .attr("height", barHeight - paddingBetween); // 加 margin 时不要忘了该这里
      }

      bar = bar
        .data(data.value, (d) => d.resultNumber)
        .join((enter) =>
          enter
            .append("rect")
            .call(setAttr)
            .on("mouseover", function () {
              tooltip.style("opacity", 1);
              svg.node()!.classList.add("highlighting");
              this.classList.add("highlighted");
            })
            .on("mousemove", (ev, d) => {
              tooltip
                .text(`${(d.portion * 100).toFixed(2)}% (${d.count})`)
                .style("left", `${ev.pageX + 16}px`)
                .style("top", `${ev.pageY}px`);
            })
            .on("mouseleave", function () {
              tooltip.style("opacity", 0);
              svg.node()!.classList.remove("highlighting");
              this.classList.remove("highlighted");
            })
        )
        .call((bar) => bar.transition().call(setAttr));
    },
    { immediate: true }
  );
});
</script>
