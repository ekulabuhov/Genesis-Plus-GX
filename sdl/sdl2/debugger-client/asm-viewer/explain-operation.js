import { toHex } from "../utils.js";

/**
 * @param {import("./asm-viewer.component").instruction} instr
 * @param {{[key: string]: number}} regs
 */
export function explainOperation(instr, regs, previousOp = false) {
  let explain;
  instr.valTooltip = "";

  if (instr.mnemonic.split(".")[0] === "move") {
    const size = instr.mnemonic.split(".")[1];
    // const operands = instr.op_str.split(", ");
    const operands = regs.comment.split(' = ').reverse();
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
        if ((fromValue & 0xff00) === 0x8000) {
          instr.valTooltip = `mode set register #1\n\n`;
          const m3 = fromValue & (0b1 << 1);
          const ie1 = fromValue & (0b1 << 4);
          const lcb = fromValue & (0b1 << 5);
          instr.valTooltip += `${m3 ? "" : "do not"} freeze HV counter\n`;
          instr.valTooltip += `${
            ie1 ? "enable" : "disable"
          } hblank interrupt\n`;
          instr.valTooltip += `${
            lcb ? "" : "do not"
          } blank the leftmost column (8px wide)\n`;
        }

        if ((fromValue & 0xff00) === 0x8100) {
          instr.valTooltip = `mode set register #2\n\n`;
          const m2 = fromValue & 8;
          const m1 = fromValue & 16;
          const ie0 = fromValue & 32;
          const disp = fromValue & 64;
          instr.valTooltip += `set vertical resolution to ${
            m2 ? "30" : "28"
          } tiles\n`;
          instr.valTooltip += `${m1 ? "allow" : "forbid"} DMA operations\n`;
          instr.valTooltip += `${
            ie0 ? "enable" : "disable"
          } vblank interrupt\n`;
          instr.valTooltip += `${disp ? "enable" : "disable"} rendering\n`;
        }

        if ((fromValue & 0xff00) === 0x8200) {
          instr.valTooltip = `plane A table address (divided by $2000)\n`;
          instr.valTooltip += `new value: $${(
            (fromValue << 10) &
            0xe000
          ).toString(16)}`;
        }

        if ((fromValue & 0xff00) === 0x8300) {
          instr.valTooltip = `window table base address (divided by $800). In H40 mode, WD11 must be 0.`;
        }

        if ((fromValue & 0xff00) === 0x8400) {
          instr.valTooltip = `plane B table base address (divided by $2000)\n`;
          instr.valTooltip += `new value: $${(
            (fromValue << 13) &
            0xe000
          ).toString(16)}`;
        }

        if ((fromValue & 0xff00) === 0x8500) {
          instr.valTooltip = `sprite table base address (divided by $200). In H40 mode, AT9 must be 0.\n`;
          instr.valTooltip += `new value: $${(
            (fromValue << 9) &
            0xfe00
          ).toString(16)}`;
        }

        if ((fromValue & 0xff00) === 0x8700) {
          instr.valTooltip = `background color`;
        }

        if ((fromValue & 0xff00) === 0x8a00) {
          instr.valTooltip = `hblank interrupt rate\n\nhow many lines to wait between hblank interrupts`;
        }

        if ((fromValue & 0xff00) === 0x8b00) {
          instr.valTooltip = `mode set register #3`;
        }

        if ((fromValue & 0xff00) === 0x8c00) {
          instr.valTooltip = `mode set register #4\n\n`;
          const rs = fromValue & 0x81;
          const lsm = fromValue & 6;
          const ste = fromValue & 8;

          instr.valTooltip += `horizontal resolution: ${
            rs === 0x81 ? 40 : 32
          } tiles\n`;
          instr.valTooltip += `${
            ste ? "enable" : "disable"
          } shadow/highlight\n`;
          instr.valTooltip += `${lsm ? "interlaced mode" : "no interlacing"}`;
        }

        if ((fromValue & 0xff00) === 0x8d00) {
          instr.valTooltip = `hscroll table base address (divided by $400)`;
        }

        if ((fromValue & 0xff00) === 0x8f00) {
          instr.valTooltip = `autoincrement amount (in bytes)`;
        }

        if ((fromValue & 0xff00) === 0x9000) {
          instr.valTooltip = `tilemap size\n\n`;
          const hzs = fromValue & 3;
          const vzs = (fromValue >> 4) & 3;
          instr.valTooltip = `Size in tiles: ${(hzs + 1) * 32}x${
            (vzs + 1) * 32
          }`;
        }

        if ((fromValue & 0xff00) === 0x9100) {
          instr.valTooltip = `window X division`;
        }

        if ((fromValue & 0xff00) === 0x9200) {
          instr.valTooltip = `window Y division`;
        }

        if ((fromValue & 0xff00) === 0x9300) {
          instr.valTooltip = `DMA length (low)`;
        }

        if ((fromValue & 0xff00) === 0x9400) {
          instr.valTooltip = `DMA length (high)`;
        }

        if ((fromValue & 0xff00) === 0x9500) {
          instr.valTooltip = `DMA source (low)`;
        }

        if ((fromValue & 0xff00) === 0x9600) {
          instr.valTooltip = `DMA source (middle)`;
        }

        if ((fromValue & 0xff00) === 0x9700) {
          instr.valTooltip = `DMA source (high)\n\n`;
          const dmd = (fromValue & 0xff) >> 6;
          const op = {
            0: "DMA transfer (DMD0 becomes SA23)",
            1: "DMA transfer (DMD0 becomes SA23)",
            2: "VRAM fill",
            3: "VRAM copy",
          };

          instr.valTooltip += op[dmd];
        }
      }

      if (toValue === 0xa00000) {
        instr.valTooltip = `$A00000 is the start of Z80 RAM`;
      }

      if (toValue === 0xa11100) {
        if (fromValue === 0x100) {
          instr.valTooltip = `Stop Z80 with BusReq to access Z80 memory`;
        }
      }

      if (toValue === 0xa12100) {
        instr.valTooltip = `Z80 reset control register`;
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

  return { explain };
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
