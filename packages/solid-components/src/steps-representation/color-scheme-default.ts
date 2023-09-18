import { ColorScheme } from "./color-scheme";

export const defaultColorScheme: ColorScheme = {
  levels: [
    [ // indigo-900 < blue > sky-900
      { background: [0x31, 0x2e, 0x81] },
      { background: [0x0c, 0x4a, 0x6e] },
    ],
    [ // emerald-900 < green > lime-900
      { background: [0x06, 0x4e, 0x3b] },
      { background: [0x36, 0x53, 0x14] },
    ],
    [ // fuchsia-900 < purple > violet-900
      { background: [0x70, 0x1a, 0x75] },
      { background: [0x4c, 0x1d, 0x95] },
    ],
    [ // amber-900 < orange > red-900
      { background: [0x78, 0x35, 0x0f] },
      { background: [0x7f, 0x1d, 0x1d] },
    ],
  ],

  default: {
    text: [0xff, 0xff, 0xff], // white
  },
  error: {
    background: [0xf8, 0x71, 0x71], // red-400
    text: [0x45, 0x0a, 0x0a], // red-950
  },
};
