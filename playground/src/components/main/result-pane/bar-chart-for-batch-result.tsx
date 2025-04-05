import { Component, createEffect, createMemo, on, onMount } from "solid-js";
import { Portal } from "solid-js/web";

import * as d3 from "d3";

import type * as I from "@dicexp/interface";
import { Unreachable } from "@dicexp/errors";

const BarChartForSamplingResult: Component<{
  report: I.SamplingResult;
  mode: "normal" | "at-least" | "at-most";
  highlighted: number | null;
  setHighlighted: (value: number | null) => void;
  class?: string;
}> = (props) => {
  let svgEl!: SVGSVGElement;
  let tooltipEl!: HTMLDivElement;

  const label = () => {
    switch (props.mode) {
      case "normal":
        return "=";
      case "at-least":
        return "≥";
      case "at-most":
        return "≤";
      default:
        throw new Unreachable();
    }
  };

  type DatumForD3 = {
    resultNumber: number;
    count: unknown;
    portion: number;
  };

  const data = createMemo((): DatumForD3[] => {
    let data = Object.entries(props.report.counts).map(([key, value]) => ({
      resultNumber: Number(key),
      count: value,
    }));

    if (props.mode !== "normal") {
      data.sort(({ resultNumber: a }, { resultNumber: b }) => a - b);
      let i = props.mode === "at-least" ? data.length - 1 : 0;
      const condition = props.mode === "at-least"
        ? () => i >= 0
        : () => i < data.length;
      const advancement = props.mode === "at-least" ? () => i-- : () => i++;
      let acc = 0;

      let last: (typeof data)[0] | null = null,
        lastI: number | null = null;
      const missing: typeof data = [];

      for (; condition(); advancement()) {
        if (lastI !== null) {
          let numA = data[i]!.resultNumber,
            numB = data[lastI]!.resultNumber;
          if (numA > numB) {
            [numA, numB] = [numB, numA];
          }
          if (numB - numA !== 1) {
            for (let num = numA + 1; num < numB; num++) {
              missing.push({
                ...last!,
                resultNumber: num,
              });
            }
          }
        }

        const _acc = acc;
        acc += data[i]!.count;
        data[i]!.count += _acc;

        last = data[i]!;
        lastI = i;
      }

      if (missing.length) {
        data.push(...missing);
      }
    }

    return data.map((d) => ({ ...d, portion: d.count / props.report.samples }));
  });

  createEffect(on(() => props.highlighted, (newValue, oldValue) => {
    if (newValue !== null) {
      svgEl
        .querySelector(`[data-result-number="${newValue}"]`)
        ?.classList.add("highlighted");
      svgEl.classList.add("highlighting");
    } else {
      svgEl.classList.remove("highlighting");
    }
    if (oldValue !== null) {
      svgEl
        .querySelector(`[data-result-number="${oldValue}"]`)
        ?.classList.remove("highlighted");
    }
  }));

  const tooltipText = () => {
    if (props.highlighted === null) return "";
    const datum = data().find((d) => d.resultNumber === props.highlighted);
    if (!datum) return "";
    const count = datum.count as number;
    const portion = count / props.report.samples;
    return `${props.highlighted}: ${(portion * 100).toFixed(2)}% (${count})`;
  };

  onMount(() => {
    const graphWidth = 280,
      graphHeight = 280,
      paddingBetween = 0,
      axisXHeight = 40,
      axisYWidth = 40,
      marginRight = 15;

    const chartWidth = graphWidth + axisYWidth,
      chartHeight = graphHeight + axisXHeight;

    // 可参考：
    // - https://observablehq.com/@d3/learn-d3-joins
    // - https://www.d3indepth.com/axes/
    // - https://d3-graph-gallery.com/graph/interactivity_tooltip.html
    const svg = d3
      .select(svgEl) //
      .attr("viewBox", [0, 0, chartWidth + marginRight, chartHeight]);

    let bar: d3.Selection<d3.BaseType, DatumForD3, SVGGElement, unknown> = svg
      .append("g") //
      .attr("fill", "steelblue")
      .attr("transform", `translate(${axisYWidth}, ${axisXHeight})`)
      .selectAll("rect");

    let axisX = svg.append("g");
    let axisY = svg.append("g");

    const tooltip = d3.select(tooltipEl);

    createEffect(on(data, () => {
      const minNumber = d3.min(data(), (d) => d.resultNumber)!,
        maxNumber = d3.max(data(), (d) => d.resultNumber)!,
        maxPortion = d3.max(data(), (d) => d.portion)!;

      const bars = maxNumber - minNumber + 1;
      const barRange = Array(bars)
        .fill(null)
        .map((_, i) => i);
      const barHeight = graphHeight / bars;
      const axesOffsetY = (barHeight + paddingBetween) / 2;

      const x = d3 // 横轴：几率
        .scaleLinear()
        .domain([0, maxPortion])
        .range([0, graphWidth]);

      axisX = axisX
        .call(
          d3
            .axisTop(x)
            .ticks(10)
            .tickFormat((d) => ((d as number) * 100).toFixed() + "%"),
        )
        .attr(
          "transform",
          `translate(${axisYWidth}, ${axisXHeight - axesOffsetY})`,
        );

      const y = d3 // 纵轴：结果数字
        .scaleQuantize()
        .domain([minNumber, maxNumber])
        .range(barRange.map((i) => i * barHeight));

      axisY = axisY
        .call(d3.axisLeft(y))
        .attr(
          "transform",
          `translate(${axisYWidth}, ${axisXHeight + axesOffsetY})`,
        );

      function setAttr(sel: any) {
        sel
          .attr("x", x(0))
          .attr("y", (d: DatumForD3) => y(d.resultNumber) + paddingBetween / 2) // 加 margin 时不要忘了该这里
          .attr("width", (d: DatumForD3) => x(d.portion) - x(0))
          .attr("height", barHeight - paddingBetween); // 加 margin 时不要忘了该这里
      }

      bar = bar
        .data(data(), (d) => d.resultNumber)
        .join((enter) =>
          enter
            .append("rect")
            .attr("data-result-number", (d) => d.resultNumber)
            .call(setAttr)
            .on("mouseover", function (_ev, d) {
              tooltip.style("display", "block");
              props.setHighlighted(d.resultNumber);
            })
            .on("mousemove", (ev, _d) => {
              tooltip
                .style("left", `${ev.pageX + 16}px`)
                .style("top", `${ev.pageY}px`);
            })
            .on("mouseleave", function () {
              tooltip.style("display", "none");
              props.setHighlighted(null);
            })
        )
        .call((bar) => bar.transition().call(setAttr));
    }));
  });

  return (
    <div
      class={`flex flex-col justify-center items-center ${props.class ?? ""}`}
    >
      <div class="text-xl">{label()}</div>

      <svg ref={svgEl}>
        <style type="text/css">
          {`
            .highlighting rect {
              opacity: 40%;
            }
            rect.highlighted {
              opacity: unset;
            }
          `}
        </style>
      </svg>

      <Portal>
        <div
          ref={tooltipEl}
          class="absolute hidden bg-white text-black border-2 z-10 rounded-sm opacity-60 p-[3px]"
        >
          {tooltipText()}
        </div>
      </Portal>
    </div>
  );
};
export default BarChartForSamplingResult;
