export type RGBColor = [r: number, g: number, b: number];

export interface ColorScheme {
  /**
   * 不同嵌套层数有不同的的方案。
   */
  levels: ColorSchemeForLevel[];
  /**
   * 各层中每多少 rank 循环一次方案。
   */
  rankPeriod: number;

  default: {
    text: RGBColor;
  };
  error: {
    background: RGBColor;
    text: RGBColor;
  };

  value_number: {
    text: RGBColor;
  };
  value_boolean: {
    text: RGBColor;
  };
  identifier: {
    text: RGBColor;
  };
  regular_function: {
    text: RGBColor;
  };
  opeator: {
    text: RGBColor;
  };
  operator_special: {
    text: RGBColor;
  };
  more: {
    text: RGBColor;
  };
}

/**
 * 同一层根据所处槽位的位次，有不同的方案。
 */
type ColorSchemeForLevel = ColorSchemeForRank[];

interface ColorSchemeForRank {
  background: RGBColor;
  // surroundingText: RGBColor;
}
