import { WsService } from "./ws.service.js";

/**
 * @param {number | undefined} val
 * @param {string | undefined} [size]
 */
export function toHex(val, size) {
  if (val === undefined) {
    return;
  }

  let slice = 0;
  if (size === "w") {
    slice = -4;
  }

  val = val < 0 ? 0x100000000 + val : val;
  return "$" + val.toString(16).toUpperCase().slice(slice);
}

export async function getRgbPalettesFromCram() {
  const { data: cram } = await WsService.showMemoryLocation(0, 128, "cram");
  /** @type {{red: number, green: number, blue: number}[][]} */
  const palettes = [[], [], [], []];
  for (let ci = 0; ci < cram.length; ci += 2) {
    const bytes = [...cram[ci], ...cram[ci + 1]];
    for (let i = 0; i < 32; i += 2) {
      const byte = bytes[i];
      // Max brightness value for CSS color is 0xFF and for Genesis it's 0xE, multiply by 0x12 to convert between two
      const blue = 0x12 * byte;
      const green = (bytes[i + 1] >> 4) * 0x12;
      const red = (bytes[i + 1] & 0xf) * 0x12;
      palettes[ci / 2][i / 2] = {
        red,
        green,
        blue,
      };
    }
  }

  return palettes;
}