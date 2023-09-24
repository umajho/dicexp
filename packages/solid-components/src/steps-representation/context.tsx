import { createContext } from "solid-js";
import { ColorScheme } from "./color-scheme";

export interface RepresentationContextData {
  colorScheme: ColorScheme;
}

export const RepresentationContext = createContext<RepresentationContextData>();
