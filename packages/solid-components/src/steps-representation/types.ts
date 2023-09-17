export type CSSColor = CSSStyleDeclaration["color"];
/**
 * 对应位次的轮替。
 */
export type ColorPalette = CSSColor[];
/**
 * 对应深度的轮替。
 */
export type ColorPalette2D = ColorPalette[];

export interface TextColors {
  normal: CSSColor;
  forError: CSSColor;
}
