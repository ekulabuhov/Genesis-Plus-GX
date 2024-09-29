import { toHex } from "../utils.js";

/**
 * @param {import("./asm-viewer.component").instruction} instr
 * @param {{[key: string]: number}} regs
 */
export function explainOperation(instr, regs, previousOp = false) {
  let explain;
  let valTooltip = "";

  if (instr.mnemonic.split(".")[0] === "move") {
    /** @type { 'l' | 'w' } */
    const size = instr.mnemonic.split(".")[1];
    // const operands = instr.op_str.split(", ");
    const operands = regs.comment.split(" = ").reverse();
    const fromValueIndirect = operands[0].includes("(");
    // const fromValue = decodeOperand(operands[0], regs, size, previousOp);
    const fromValue = parseInt(operands[0].replaceAll(/[\(\)]/g, ""), 16);
    const isSimpleReg = /^[a,d][0-7]$/.test(operands[1]);
    const toValueIndirect = operands[1].includes("(");
    // const toValue = decodeOperand(operands[1], regs, size, previousOp);
    const toValue = parseInt(operands[1].replaceAll(/[\(\)]/g, ""), 16);

    if (fromValue !== undefined && toValue !== undefined) {
      const isRomOrRamAddress = (address) =>
        address <= 0x3fffff || (address >= 0xff0000 && address <= 0xffffff);
      const isRomOrRamAccess =
        (toValueIndirect && isRomOrRamAddress(toValue)) ||
        (fromValueIndirect && isRomOrRamAddress(fromValue));

      if (isRomOrRamAccess) {
        return {};
      }

      // Additional break down VDP writes
      if (toValue === 0xc00004) {
        valTooltip = explainVDPOperation(fromValue);
        if (size === 'l') {
          valTooltip += '\n' + explainVDPOperation(fromValue >> 16);
        }
      }

      if (toValue === 0xa00000) {
        valTooltip = `$A00000 is the start of Z80 RAM`;
      }

      if (toValue === 0xa11100) {
        if (fromValue === 0x100) {
          valTooltip = `Stop Z80 with BusReq to access Z80 memory`;
        }
      }

      if (toValue === 0xa12100) {
        valTooltip = `Z80 reset control register`;
      }
    }
  }

  if (instr.mnemonic.split(".")[0] === "clr") {
    const toValue = decodeOperand(instr.op_str, regs, previousOp);
    explain = `${toHex(toValue)}=$0`;
  }

  if (instr.mnemonic.split(".")[0] === "addi") {
    const operands = instr.op_str.split(", ");
    const fromValue = decodeOperand(operands[0], regs, previousOp);
    explain = `${operands[1]}=${toHex(
      previousOp ? regs[operands[1]] : fromValue + regs[operands[1]]
    )}`;
  }

  return { explain, valTooltip };
}

/**
 * @param {number} word - 2 bytes
 */
function explainVDPOperation(word) {
  let valTooltip = "";
  if ((word & 0xff00) === 0x8000) {
    valTooltip = `mode set register #1\n\n`;
    const m3 = word & (0b1 << 1);
    const ie1 = word & (0b1 << 4);
    const lcb = word & (0b1 << 5);
    valTooltip += `${m3 ? "" : "do not"} freeze HV counter\n`;
    valTooltip += `${ie1 ? "enable" : "disable"} hblank interrupt\n`;
    valTooltip += `${
      lcb ? "" : "do not"
    } blank the leftmost column (8px wide)\n`;
  }

  if ((word & 0xff00) === 0x8100) {
    valTooltip = `mode set register #2\n\n`;
    const m2 = word & 8;
    const m1 = word & 16;
    const ie0 = word & 32;
    const disp = word & 64;
    valTooltip += `set vertical resolution to ${m2 ? "30" : "28"} tiles\n`;
    valTooltip += `${m1 ? "allow" : "forbid"} DMA operations\n`;
    valTooltip += `${ie0 ? "enable" : "disable"} vblank interrupt\n`;
    valTooltip += `${disp ? "enable" : "disable"} rendering\n`;
  }

  if ((word & 0xff00) === 0x8200) {
    valTooltip = `plane A table address (divided by $2000)\n`;
    valTooltip += `new value: $${((word << 10) & 0xe000).toString(16)}`;
  }

  if ((word & 0xff00) === 0x8300) {
    valTooltip = `window table base address (divided by $800). In H40 mode, WD11 must be 0.`;
  }

  if ((word & 0xff00) === 0x8400) {
    valTooltip = `plane B table base address (divided by $2000)\n`;
    valTooltip += `new value: $${((word << 13) & 0xe000).toString(16)}`;
  }

  if ((word & 0xff00) === 0x8500) {
    valTooltip = `sprite table base address (divided by $200). In H40 mode, AT9 must be 0.\n`;
    valTooltip += `new value: $${((word << 9) & 0xfe00).toString(16)}`;
  }

  if ((word & 0xff00) === 0x8700) {
    valTooltip = `background color`;
  }

  if ((word & 0xff00) === 0x8a00) {
    valTooltip = `hblank interrupt rate\n\nhow many lines to wait between hblank interrupts`;
  }

  if ((word & 0xff00) === 0x8b00) {
    valTooltip = `mode set register #3`;
  }

  if ((word & 0xff00) === 0x8c00) {
    valTooltip = `mode set register #4\n\n`;
    const rs = word & 0x81;
    const lsm = word & 6;
    const ste = word & 8;

    valTooltip += `horizontal resolution: ${rs === 0x81 ? 40 : 32} tiles\n`;
    valTooltip += `${ste ? "enable" : "disable"} shadow/highlight\n`;
    valTooltip += `${lsm ? "interlaced mode" : "no interlacing"}`;
  }

  if ((word & 0xff00) === 0x8d00) {
    valTooltip = `hscroll table base address (divided by $400)`;
  }

  if ((word & 0xff00) === 0x8f00) {
    valTooltip = `autoincrement amount (in bytes): ${word & 0xFF}`;
  }

  if ((word & 0xff00) === 0x9000) {
    valTooltip = `tilemap size\n\n`;
    const hzs = word & 3;
    const vzs = (word >> 4) & 3;
    valTooltip = `Size in tiles: ${(hzs + 1) * 32}x${(vzs + 1) * 32}`;
  }

  if ((word & 0xff00) === 0x9100) {
    valTooltip = `window X division`;
  }

  if ((word & 0xff00) === 0x9200) {
    valTooltip = `window Y division`;
  }

  if ((word & 0xff00) === 0x9300) {
    valTooltip = `DMA length (low): ${toHex(word & 0xFF)}`;
  }

  if ((word & 0xff00) === 0x9400) {
    valTooltip = `DMA length (high): ${toHex(word & 0xFF)}`;
  }

  if ((word & 0xff00) === 0x9500) {
    valTooltip = `DMA source (low): ${toHex(word & 0xFF)}`;
  }

  if ((word & 0xff00) === 0x9600) {
    valTooltip = `DMA source (middle): ${toHex(word & 0xFF)}`;
  }

  if ((word & 0xff00) === 0x9700) {
    valTooltip = `DMA source (high): ${toHex(word & 0xFF)}\n`;
    const dmd = (word & 0xff) >> 6;
    const op = {
      0: "DMA transfer (DMD0 becomes SA23)",
      1: "DMA transfer (DMD0 becomes SA23)",
      2: "VRAM fill",
      3: "VRAM copy",
    };

    valTooltip += op[dmd];
  }

  return valTooltip;
}

/**
 * @param {string} operand
 * @param {{ [x: string]: number; }} regs
 * @param {'l'|'w'|'b'} size
 * @param {boolean} previousOp
 * @returns {number | undefined}
 */
function decodeOperand(operand, regs, size, previousOp = false) {
  const sizeMask = {
    l: 0xffffffff,
    w: 0xffff,
    b: 0xff,
  }[size];

  // D0-D7 and A0-A7
  if (/^[a,d][0-7]$/.test(operand)) {
    return regs[operand] & sizeMask;
  }

  // Plain number: #$8f02
  if (/^#\$[0-9,a-f]{2,4}$/.test(operand)) {
    return parseInt(operand.replace("#$", "0x"));
  }

  // $4(a3)
  const match = operand.match(/^\$([0-9,a-f]+)\(([a,d][0-7])\)$/);
  if (match) {
    const append = match[1];
    const reg = match[2];
    return regs[reg] + parseInt(append);
  }

  // (A0-D7)+ - reg with post-increment
  if (operand.indexOf("+") === 4) {
    operand = operand.replace(/[+(,)]/g, "");
    return regs[operand] + (previousOp ? -4 : 0);
  }
  // (A0)-(A7) and (D0)-(D7)
  if (operand.indexOf("(") === 0) {
    operand = operand.replace(/[(,)]/g, "");
    return regs[operand];
  }
  // -(A0-D7) - reg with pre-decrement
  if (operand.indexOf("-") === 0) {
    operand = operand.replace(/[-(,)]/g, "");
    return regs[operand] + (previousOp ? 0 : -4);
  }
}
