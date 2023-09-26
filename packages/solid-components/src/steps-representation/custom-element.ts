import { customElement } from "solid-element";

import { StepsRepresentation } from "./StepsRepresentation";
import type { Repr } from "dicexp/internal";

export function registerCustomElement(tag = "steps-representation") {
  customElement(tag, { repr: null as unknown as Repr }, StepsRepresentation);
}
