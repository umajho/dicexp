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
  ...{
    /*!
      MIT License

      Copyright 2023 Umaĵo <umajho@tuan.run>
      Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others
      Copyright (c) 2016 GitHub Inc.

      Permission is hereby granted, free of charge, to any person obtaining a copy
      of this software and associated documentation files (the "Software"), to deal
      in the Software without restriction, including without limitation the rights
      to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
      copies of the Software, and to permit persons to whom the Software is
      furnished to do so, subject to the following conditions:

      The above copyright notice and this permission notice shall be included in
      all copies or substantial portions of the Software.

      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
      IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
      FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
      AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
      LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
      OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
      THE SOFTWARE.
    */

    // see: https://github.com/atom/one-dark-syntax
    // see: https://github.com/codemirror/theme-one-dark

    value_number: {
      text: [0xe5, 0xc0, 0x7b], // chalky (t.number)
    },
    value_boolean: {
      text: [0xd1, 0x9a, 0x66], // whiskey (t.bool)
    },
    identifier: {
      text: [0xe0, 0x6c, 0x75], // coral (t.name)
    },
    regular_function: {
      text: [0xd1, 0x9a, 0x66], // whiskey (t.standard(t.name))
    },
    opeator: {
      text: [0x56, 0xb6, 0xc2], // cyan (t.operator)
    },
    operator_special: {
      text: [0xc6, 0x78, 0xdd], // violet (t.keyword)
    },
  },
};
