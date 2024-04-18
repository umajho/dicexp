import { customElement } from "solid-element";

import { StepsRepresentation } from "./StepsRepresentation";
import { Repr } from "@dicexp/interface";

export function registerCustomElement(tag = "steps-representation") {
  customElement(tag, { repr: null as unknown as Repr }, StepsRepresentation);
}
