export class OffsetBuffer {
  constructor(private offset: number, private buffer: Buffer) {}

  readUInt32BE() {
    this.offset += 4;
    return this.buffer.readUInt32BE(this.offset - 4);
  }

  readUInt16BE() {
    this.offset += 2;
    return this.buffer.readUInt16BE(this.offset - 2);
  }

  readUInt8() {
    this.offset += 1;
    return this.buffer.readUInt8(this.offset - 1);
  }

  readUleb128() {
    // temporary
    return this.readUInt8();
  }

  readSleb128() {
    let value = 0;
    let shift = 0;
    while (true) {
      const b = this.readUInt8();
      value |= (b & 0x7f) << shift;
      shift += 7;

      if ((b & 0x80) === 0) {
        if (b & 0x40) {
          return value | (~0 << shift);
        }
        return value;
      }
    }
  }

  readInt8() {
    this.offset += 1;
    return this.buffer.readInt8(this.offset - 1);
  }

  subarray(length: number) {
    this.offset += length;
    return this.buffer.subarray(this.offset - length, this.offset);
  }

  peek() {
    return this.buffer.readUInt8(this.offset);
  }

  readCString() {
    const nullTerm = this.buffer.indexOf(0, this.offset);
    const raw_value = this.buffer.toString("utf8", this.offset, nullTerm);
    this.offset = nullTerm + 1;
    return raw_value;
  }

  tell() {
    return this.offset;
  }
}
