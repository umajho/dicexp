// TODO: details/summary
export type Representation = (
  | string
  | { error: string }
)[];

// TODO: details/summary
export type RuntimeRepresentation = (
  | string
  | { error: string }
  | RuntimeRepresentation
  | { defer: () => RuntimeRepresentation }
)[];
