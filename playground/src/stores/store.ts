import { createStore, produce } from "solid-js/store";
import { ResultRecord } from "../types";

interface StoreData {
  doc: string;

  records: ResultRecord[];
}

const [store, setStore] = createStore<StoreData>({
  doc: localStorage.getItem("autosave") ?? "",
  records: [],
});

export const records = () => store.records;
export function pushRecord(record: ResultRecord) {
  setStore("records", records().length, record);
}
export function clearResult() {
  setStore("records", []);
}
export function clear(i: number) {
  setStore(
    "records",
    produce((r) => {
      r.splice(i, 1);
    }),
  );
}

export const doc = () => store.doc;
export function setDoc(doc: string) {
  setStore("doc", doc);
  localStorage.setItem("autosave", doc);
}
