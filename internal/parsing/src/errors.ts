export class Unreachable extends Error {
  constructor(message?: string) {
    if (message !== undefined) {
      super(message);
      return;
    }
    super("Unreachable");
  }
}

export class Unimplemented extends Error {
  constructor(message?: string) {
    if (message !== undefined) {
      super(message);
      return;
    }
    super("Unimplemented");
  }
}
