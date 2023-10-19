import { createContext } from "solid-js";
import { ColorScheme } from "./color-scheme";

export interface RepresentationContextData {
  colorScheme: ColorScheme;

  // ListLike 在折叠时显示前多少基础类型的项的结果。
  listPreviewLimit: number;
  // 求和步骤在折叠时显示前多少基础类型的项的结果。
  sumPreviewLimit: number;

  autoExpansionDepthLimit: number;
}

export const RepresentationContext = createContext<RepresentationContextData>();
