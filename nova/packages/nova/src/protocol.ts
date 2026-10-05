/**
 * Wire-format decoding shared by the compiler error buffer and the builtins
 * result buffer. Source of truth: `nova/docs/plan.md` §3.6.
 */

export type DecodedParam =
  | { tag: 0; int: number }
  | { tag: 1; str: string }
  | { tag: 2; valueType: number }
  | { tag: 3; valueTypeSet: number };

export interface DecodedError {
  key: number;
  params: DecodedParam[];
}

export interface DecodedCompileError extends DecodedError {
  /** Span as Unicode-scalar (char) indices into the source. */
  start: number;
  end: number;
}

export class WireDecodeError extends Error {}

class Reader {
  private offset = 0;
  private readonly view: DataView;
  private readonly bytes: Uint8Array;

  constructor(buffer: ArrayBufferLike, byteOffset: number, byteLength: number) {
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.bytes = new Uint8Array(buffer, byteOffset, byteLength);
  }

  get done(): boolean {
    return this.offset >= this.view.byteLength;
  }

  u8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  u32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i64(): number {
    this.ensure(8);
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    const n = Number(v);
    if (!Number.isSafeInteger(n)) {
      throw new WireDecodeError(`i64 out of safe range: ${v}`);
    }
    return n;
  }

  utf8(): string {
    const len = this.u32();
    this.ensure(len);
    const s = new TextDecoder().decode(
      this.bytes.subarray(this.offset, this.offset + len),
    );
    this.offset += len;
    return s;
  }

  private ensure(n: number): void {
    if (this.offset + n > this.view.byteLength) {
      throw new WireDecodeError(
        `unexpected end of buffer at ${this.offset} (+${n} > ${this.view.byteLength})`,
      );
    }
  }
}

function readParam(r: Reader): DecodedParam {
  const tag = r.u8();
  switch (tag) {
    case 0:
      return { tag, int: r.i64() };
    case 1:
      return { tag, str: r.utf8() };
    case 2:
      return { tag, valueType: r.u8() };
    case 3:
      return { tag, valueTypeSet: r.u8() };
    default:
      throw new WireDecodeError(`unknown param tag: ${tag}`);
  }
}

function readParams(r: Reader, count: number): DecodedParam[] {
  const params: DecodedParam[] = [];
  for (let i = 0; i < count; i++) params.push(readParam(r));
  return params;
}

/** Decode the compiler's error buffer (see the compiler cdylib API). */
export function decodeCompileErrors(
  buffer: ArrayBufferLike,
  byteOffset: number,
  byteLength: number,
): DecodedCompileError[] {
  const r = new Reader(buffer, byteOffset, byteLength);
  const count = r.u32();
  const errors: DecodedCompileError[] = [];
  for (let i = 0; i < count; i++) {
    const key = r.u32();
    const start = r.u32();
    const end = r.u32();
    const paramCount = r.u32();
    const params = readParams(r, paramCount);
    errors.push({ key, start, end, params });
  }
  return errors;
}

export type DecodedResult =
  | { ok: true; value: unknown }
  | { ok: false; error: DecodedError };

function readValue(r: Reader): unknown {
  const tag = r.u8();
  switch (tag) {
    case 0x00:
      return r.i64();
    case 0x01:
      return r.u8() !== 0;
    case 0x02: {
      const len = r.u32();
      const items: unknown[] = [];
      for (let i = 0; i < len; i++) items.push(readValue(r));
      return items;
    }
    default:
      throw new WireDecodeError(`unknown value tag: ${tag}`);
  }
}

/** Decode the builtins result buffer written by `finalize` (plan §3.6). */
export function decodeResult(
  buffer: ArrayBufferLike,
  byteOffset: number,
  byteLength: number,
): DecodedResult {
  const r = new Reader(buffer, byteOffset, byteLength);
  const tag = r.u8();
  if (tag === 0x03) {
    const key = r.u32();
    const paramCount = r.u32();
    const params = readParams(r, paramCount);
    return { ok: false, error: { key, params } };
  }
  // Otherwise it's a value; rewind one byte and read it.
  const r2 = new Reader(buffer, byteOffset, byteLength);
  return { ok: true, value: readValue(r2) };
}
