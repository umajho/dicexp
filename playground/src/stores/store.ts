import { createStore } from "solid-js/store";
import { Result } from "../types";

interface StoreData {
  doc: string;
  result: Result;
}

const [store, setStore] = createStore<StoreData>({
  doc: localStorage.getItem("autosave") ?? "",
  result: { type: null },
});

export const result = () => store.result;
export function setResult(result: Result) {
  setStore("result", result);
}

export const doc = () => store.doc;
export function setDoc(doc: string) {
  setStore("doc", doc);
  localStorage.setItem("autosave", doc);
}
