import { createContext } from "solid-js";
import { ColorScheme } from "./color-scheme";

export const RepresentationContext = createContext<{
  colorScheme: ColorScheme;
}>();
