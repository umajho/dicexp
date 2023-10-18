export {
  registerCustomElement as registerCustomElementForStepsRepresentation,
} from "./custom-element";

export type {
  // 其内含的 `Repr` 已由 dicexp 包引出
  Properties as StepsRepresentationProperties,
} from "./StepsRepresentation";
export type {
  ColorScheme, // `Properties`（间接）内含
} from "./color-scheme";
