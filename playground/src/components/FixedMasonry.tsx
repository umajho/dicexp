import {
  Accessor,
  Component,
  createEffect,
  createMemo,
  createSignal,
  Index,
  JSX,
  on,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";

export interface FixedMasonryItemData {
  el: HTMLElement;
}

/**
 * 瀑布流布局。
 *
 * 只在源数据或者列数发生变化时调整布局。
 * 保证其中的元素高度变化时：
 * - 不会改变布局（比如元素被挤入下一列），
 * - 也不会破坏布局（比如额外变多一列）。
 *
 * 排列元素的顺序是：
 * - 如果高度最低的列只有一个，将下个元素放入那一列。
 * - 如果高度最低的列有多个，将下个元素放入前者中最靠左的那一列。
 */
const FixedMasonry: Component<{
  source: Accessor<HTMLElement[]>;
  columns: Accessor<number>;
}> = (props) => {
  let gridEl!: HTMLDivElement;

  const [colRows, setColRows] = createSignal<number[]>([]);
  const [positionMap, setPositionMap] = //
    createSignal<Map<HTMLElement, { col: number; row: number }> | null>(null);

  createEffect(
    on([props.source, props.columns], ([source, columnNumber]) => {
      const columns = Array.from(
        { length: columnNumber },
        () => [] as HTMLElement[],
      );
      const columnHeights = Array(columnNumber).fill(0);

      for (const el of source) {
        let height = el.getBoundingClientRect().height;

        const minHeightInCol = Math.min(...columnHeights);
        const iColWithMinHeight = columnHeights.indexOf(minHeightInCol);
        columns[iColWithMinHeight]!.push(el);
        columnHeights[iColWithMinHeight]! += height;
      }

      setColRows(columns.map((c) => c.length));
      setPositionMap(
        new Map(
          columns.flatMap((els, i) =>
            els.map((el, j) => [el, { col: i, row: j }])
          ),
        ),
      );
    }),
  );

  return (
    <div
      ref={gridEl}
      style={{
        display: "grid",
        "grid-template-columns": `repeat(${props.columns()}, minmax(0, 1fr))`,
      }}
    >
      <div>
        <Index each={props.source()}>
          {(el) => {
            const pos = createMemo(() => positionMap()?.get(el()));
            const col = () => (pos()?.col ?? 0);
            const row = () => pos()?.row;
            const mount = () => {
              if (col() === 0) return undefined;
              const colEl = gridEl.children[col()]!;
              while (!colEl.children[row()!]) {
                colEl.appendChild(document.createElement("div"));
              }
              return colEl.children[row()!]!;
            };
            return (
              <Dynamic
                component={col() === 0
                  ? ((props: { children: JSX.Element }) => (
                    <div>{props.children}</div>
                  ))
                  : Portal}
                mount={mount()}
              >
                {el()}
              </Dynamic>
            );
          }}
        </Index>
      </div>
      <Index each={colRows().slice(1)}>
        {(_) => <div />}
      </Index>
    </div>
  );
};

export default FixedMasonry;
