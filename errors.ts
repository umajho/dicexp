export class Unreachable extends Error {
  constructor(message?: string) {
    if (message !== undefined) {
      super(message);
      return;
    }
    super();
  }
}

export class Unimplemented extends Error {
}
