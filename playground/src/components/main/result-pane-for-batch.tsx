import { Component, createMemo, createSignal, Show } from "solid-js";

import { HiOutlineXMark } from "solid-icons/hi";
import { Button, Card } from "../ui";
import { ResultErrorAlert } from "./ui";
import { BarChartForBatchResult } from "./bar-chart-for-batch-result";
import * as store from "../../stores/store";

import { BatchReportForWorker } from "dicexp/internal";
import { getErrorDisplayInfo } from "../../misc";

const numberFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export const ResultPaneForBatch: Component<{ report: BatchReportForWorker }> = (
  props,
) => {
  const statis = (): BatchReportForWorker["statistics"] | null => {
    return props.report.statistics ?? null;
  };
  const timeConsumption = createMemo(() => {
    const theStatis = statis();
    if (!theStatis) return null;
    return theStatis.now.ms - theStatis.start.ms;
  });
  const statisText = createMemo(() => {
    return {
      samples: props.report.ok?.samples.toLocaleString(),
      ...(timeConsumption()
        ? { duration: numberFormat.format(timeConsumption()! / 1000) }
        : {}),
      ...(timeConsumption() && props.report.ok
        ? {
          speed: numberFormat.format(
            (props.report.ok.samples / timeConsumption()!) * 1000,
          ),
        }
        : {}),
    };
  });

  const errorDisplayInfo = () => {
    if (!props.report.error) return null;
    return getErrorDisplayInfo(props.report.specialErrorType);
  };

  const [highlighted, setHighlighted] = createSignal<number | null>(null);

  return (
    <Card class="min-w-[80vw]" bodyClass="p-6 gap-4">
      <div class="flex justify-end">
        {/* 关闭 */}
        <Button
          icon={<HiOutlineXMark size={24} />}
          size="sm"
          shape="square"
          hasOutline={true}
          disabled={!props.report.stopped}
          onClick={() => store.clearResult()}
        />
      </div>

      <Show when={props.report.error}>
        <ResultErrorAlert
          kind={errorDisplayInfo()!.kind}
          error={props.report.error!}
          showsStack={errorDisplayInfo()!.showsStack}
        />
      </Show>

      {/* 条形图 */}
      <Show when={(props.report.ok?.samples ?? 0) > 0}>
        <div class="flex flex-col md:flex-row justify-around items-center gap-2 max-md:divide-y">
          <BarChartForBatchResult
            report={props.report!.ok!}
            mode="at-least"
            highlighted={highlighted()}
            setHighlighted={setHighlighted}
            class="w-[25rem] md:w-60 lg:w-80"
          />

          <hr class="md:hidden" />

          <BarChartForBatchResult
            report={props.report!.ok!}
            mode="normal"
            highlighted={highlighted()}
            setHighlighted={setHighlighted}
            class="w-[25rem] md:w-60 lg:w-80"
          />

          <hr class="md:hidden" />

          <BarChartForBatchResult
            report={props.report!.ok!}
            mode="at-most"
            highlighted={highlighted()}
            setHighlighted={setHighlighted}
            class="w-[25rem] md:w-60 lg:w-80"
          />
        </div>
      </Show>

      {/* 统计 */}
      <Show when={props.report.ok || statis()}>
        <div class="flex flex-col text-xs text-slate-500">
          <Show when={statisText()!.samples}>
            <div>
              <span class="font-mono">样本：{statisText()!.samples}个</span>
            </div>
          </Show>

          <Show when={statisText()!.duration}>
            <div>
              <span class="font-mono">
                {props.report.stopped ? "" : "目前"}用时：{statisText()!
                  .duration}秒
              </span>
            </div>
          </Show>

          <Show when={statisText()!.speed}>
            <div>
              <span class="font-mono">
                平均效率：{statisText()!.speed}个/秒
              </span>
            </div>
          </Show>
        </div>
      </Show>
    </Card>
  );
};
