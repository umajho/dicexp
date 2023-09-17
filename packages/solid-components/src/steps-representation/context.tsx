import { createContext } from "solid-js";
import { ColorPalette2D, CSSColor, TextColors } from "./types";

export const RepresentationContext = createContext<{
  backgroundColorPalette2D: ColorPalette2D;
  backgroundColorForError: CSSColor;
  textColors: TextColors;
}>();
