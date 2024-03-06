import { displayHex } from "../utils.js";
import { WsService } from "../ws.service.js";

export class AsmViewerController {
  /**
   * @type {{ address: number; mnemonic: string; op_str: string; explain: string; valTooltip: string }[]} asm
   * @prop {string} explain - is used to add context to executed instruction, e.g. explain type of VDP operation
   * @prop {string} valTooltip - is used to add even more context when you hover over, e.g. explain bits set in VDP operation
   */
  asm = [];
  debugLineTop = 0;
  branchLineTop = 0;
  branchLineHeight = 0;
  /** @type {import("../index").regs} */
  regs;
  firstInstructionIndex = 0;
  stopScrollEvents = false;
  totalInstructionCount = 0;
  /** @type {{start_address: number, end_address: number, name: string, references: string[]}[]} */
  funcs = [];
  /** @type {import("../menu/menu.service.js").MenuService} */
  menuService;

  constructor(menuService) {
    this.menuService = menuService;
    WsService.asmViewer = this;

    WsService.on("open", async () => {
      this.funcs = await WsService.sendMessage("funcs");
    });

    const el = this.disasmWindow;
    el.onscroll = (e) => {
      if (this.stopScrollEvents) {
        return;
      }

      const firstTop = this.firstInstructionIndex * 24;
      if (
        el.scrollTop < firstTop + el.clientHeight * 2 &&
        this.asm[0].address !== 0
      ) {
        console.log("should load up");
        this.stopScrollEvents = true;
        setTimeout(() => {
          const currentInstructionIdx = Math.ceil(el.scrollTop / 24);
          this.ws.send(`asm 0 ${Math.max(1, currentInstructionIdx)} 100`);
        }, 500);
      }

      const lastTop = (this.firstInstructionIndex + this.asm.length) * 24;
      if (el.scrollTop > lastTop - el.clientHeight * 3) {
        console.log("should load down");
        this.stopScrollEvents = true;
        setTimeout(() => {
          const currentInstructionIdx = Math.ceil(el.scrollTop / 24 + 12);
          this.ws.send(`asm 0 ${currentInstructionIdx} 100`);
        }, 500);
      }
    };
  }

  /** @type {WebSocket} */
  get ws() {
    return window["ws"];
  }

  /** @type {HTMLDivElement} */
  get disasmWindow() {
    return document.querySelector(".disasm-window");
  }

  $onChanges(changesObj) {
    if (changesObj["asm"]?.currentValue) {
      this.insertFunctionLabels();

      if (this.stopScrollEvents) {
        this.stopScrollEvents = false;
      }

      if (this.waitingForAsm) {
        this.waitingForAsm = false;
        this.refresh();
      }
    }

    if (changesObj["regs"]?.currentValue) {
      this.refresh();
    }
  }

  insertFunctionLabels() {
    this.funcs.forEach((func) => {
      const fa = this.asm.findIndex(
        (asm) => asm.address === func.start_address
      );
      if (fa !== -1) {
        this.asm.splice(fa, 0, {
          mnemonic:
            (func.name ||
              `FUN_${func.start_address.toString(16).padStart(8, "0")}`) + ":",
          type: "label",
          references: func.references,
        });
      }
    });
  }

  /**
   * @param {MouseEvent} event
   * @param {string[]} references
   */
  onReferencesClick(event, references) {
    event.preventDefault();
    event.stopPropagation();
    this.menuService.showMenu(
      event,
      references.map((r) => ({
        label: `Go to $${r}`,
        click: () => this.showAsm("0x" + r),
      }))
    );
  }

  refresh() {
    if (!this.regs?.pc) {
      return;
    }

    this.branchLineHeight = this.branchLineTop = undefined;

    const disasmWindow = this.disasmWindow;

    const instr = this.asm.find((a) => a.address === this.regs.pc);
    if (!instr) {
      console.log("instruction not found for ", this.regs.pc);
      /** @type {WebSocket} */
      const ws = window["ws"];
      ws.send(`asm ${this.regs.pc} 0 100`);
      this.waitingForAsm = true;
      return;
    }

    const instrIndex = this.asm.indexOf(instr);
    this.debugLineTop = (instrIndex + this.firstInstructionIndex) * 24 + 2;

    // Below logic is called when you step through code
    const marginInLines = 3;
    // If we're outside of current listing - jump to current instruction
    if (
      this.debugLineTop < disasmWindow.scrollTop ||
      this.debugLineTop > disasmWindow.scrollTop + disasmWindow.clientHeight
    ) {
      disasmWindow.scroll(
        0,
        (instrIndex + this.firstInstructionIndex - marginInLines) * 24
      );
    }
    // If we're close to the bottom border - auto scroll the listing
    else if (
      this.debugLineTop >
      disasmWindow.scrollTop + disasmWindow.clientHeight - 72
    ) {
      const visibleLines = Math.floor(disasmWindow.clientHeight / 24);
      disasmWindow.scroll({
        top:
          (instrIndex +
            this.firstInstructionIndex -
            visibleLines +
            marginInLines) *
          24,
        behavior: "smooth",
      });
    }

    if (instr.mnemonic.split(".")[0] === "add") {
      const operands = instr.op_str.split(", ");
      let fromValue, toValue;
      if (/^[a,d][0-7]$/.test(operands[0])) {
        fromValue = this.regs[operands[0]];
      }

      if (/^[a,d][0-7]$/.test(operands[1])) {
        toValue = this.regs[operands[1]];
      }

      if (fromValue && toValue) {
        instr.explain = `${operands[1]}=${displayHex(fromValue + toValue)}`;
      }
    }

    if (instr.mnemonic.split(".")[0] === "move") {
      const operands = instr.op_str.split(", ");
      let fromValue, toValue;
      if (/^[a,d][0-7]$/.test(operands[0])) {
        fromValue = this.regs[operands[0]];
      }

      if (operands[1].indexOf("(") !== -1) {
        operands[1] = operands[1].replace(/[(,)]/g, "");
        toValue = this.regs[operands[1]];
      }

      if (fromValue !== undefined && toValue !== undefined) {
        instr.explain = `${displayHex(toValue)}=${displayHex(
          fromValue,
          instr.mnemonic.split(".")[1]
        )}`;

        if (toValue === 0xc00004) {
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
            instr.valTooltip = `plane A table address (divided by $2000)`;
          }

          if ((fromValue & 0xff00) === 0x8300) {
            instr.valTooltip = `window table base address (divided by $800). In H40 mode, WD11 must be 0.`;
          }

          if ((fromValue & 0xff00) === 0x8400) {
            instr.valTooltip = `plane B table base address (divided by $2000)`;
          }

          if ((fromValue & 0xff00) === 0x8500) {
            instr.valTooltip = `sprite table base address (divided by $200). In H40 mode, AT9 must be 0.`;
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

    const branchInstructions = [
      "bcc",
      "bcs",
      "beq",
      "bge",
      "bgt",
      "bhi",
      "bhs",
      "ble",
      "blo",
      "bls",
      "blt",
      "bmi",
      "bne",
      "bpl",
      "bvc",
      "bvs",
    ];

    if (branchInstructions.indexOf(instr.mnemonic.split(".")[0]) !== -1) {
      const target = parseInt(instr.op_str.replace("$", "0x"));
      this.branchLineTop = instrIndex * 24 + 10;
      let branchEnd = this.asm.findIndex((a) => a.address === target);
      if (branchEnd === -1) {
        branchEnd = this.asm.length - 1;
      }
      this.branchLineHeight = branchEnd * 24 + 4 - this.branchLineTop + 10;
    }
  }

  displayTooltip(
    /** @type {MouseEvent}  */ event,
    /** @type {string} */ mnemonic
  ) {
    const branchDescription = `Bcc-Branch Conditionally
Syntax: Bcc <label>
Size: Short (8-bit displacement) or default (16-bit
displacement)

The Bcc instruction does not affect any condition codes.

If the condition specified by 'cc' is satisfied, a branch is
made to the location specified by <label>. The 'cc' is one
of the following:

CC-Carry clear\t\t\tLO-Lower (U)
CS-Carry set\t\t\t\tLS-Low or same (U)
EQ-Equal (Z-bit set)\t\tLT-Less than (S)
GE-greater than or equal (S)\tMI-Minus (V-bit set)
GT-greater than (S)\t\tNE-Not equal (Z-bit clear)
HI-High (U)\t\t\t\tPL-Plus (V-bit clear)
HS-High or same (U)\t\tVC-No overflow (V-bit clear)
LE-Less than or equal (S)\tVS-Overflow (V-bit set)

The notations (U) and (S) mean that the condition codes
apply the Unsigned and Signed operations, respectively.

If the destination of the branch is to the next instruction,
the short form of the instruction must not be used. `;

    const branchInstructions = [
      "bcc",
      "bcs",
      "beq",
      "bge",
      "bgt",
      "bhi",
      "bhs",
      "ble",
      "blo",
      "bls",
      "blt",
      "bmi",
      "bne",
      "bpl",
      "bvc",
      "bvs",
    ];

    const decrementAndBranchDescription = `DBcc-Test Condition, Decrement and Branch
Syntax: DBcc Dn, <label>
Size: Word

The DBcc instruction does not affect any condition codes.

The DBcc instruction is a loop-control primitive. There are
three parts to the instruction: A condition to be tested
(specified by ICC'), a data register used as a counter
(specified by Dn) and a label used as the target of a branch
(specified by <label».

The condition specified by 'cc' is tested first to see if the
termination condition has been met. If it has, program
execution continues with the next instruction in sequence.
If the termination condition has not been satisfied, the low
order 16 bits of the data register 'Dn' are decremented by 
one. If the result is -1, program execution continues with
the next instruction in sequence. If the result is not equal to
-1, program execution continues at the location specified
by <label>. The condition 'cc' is one of the following:

CC-Carry clear LS-Low or same (U)
CS-Carry set LT-Less than (S)
EQ-Equal MI-Minus
F-False (never true) NE-Not equal
GE-Greater than or equal (S) PL-Plus
GT-Greater than (S) RA-Always (same as F)
HI-High (U) T-Always True
HS-High or same (U) VC-No overflow
LE-Less than or equal (S) VS-Overflow
LO-Lower (U)

The notations (U) and (S) denote the condition codes for
operations which are Unsigned and Signed, respectively. `;

    const decrementAndBranchInstructions = [
      "dbcc",
      "dbcs",
      "dbeq",
      "dbf",
      "dbge",
      "dbgt",
      "dbhi",
      "dbhs",
      "dble",
      "dblo",
      "dbls",
      "dblt",
      "dbmi",
      "dbne",
      "dbpl",
      "dbra",
      "dbt",
      "dbvc",
      "dbls",
    ];

    const descriptions = {
      add: `Add Binary
Syntax: ADD <ea>,Dn
      ADD Dn,<ea>

Size: Byte, Word or Long

Condition Codes:
N-Set if the result is negative, otherwise cleared.
Z-Set if the result is zero, otherwise cleared.
V-Set if an overflow is generated, otherwise
cleared.
C-Set if a carry is generated, otherwise cleared.
X-Set the same as the carry bit.

The source operand is added to the destination operand
and the result is stored in the destination operand.
If the <ea> field is the source, all addressing modes may
be used. The Address Register Direct addressing mode
may not be used for a byte size operation. If the <ea> field
is the destination, only`,
      andi: `ANDI-Logical AND Immediate
Syntax: ANDI #<data>, <ea>
Size: Byte, Word or Long

Condition Codes:
N-Set if the most significant bit of the result is
set, otherwise cleared.
Z-Set if the result is zero, otherwise cleared.
V-Always cleared.
C-Always cleared.

The immediate data field is logically ANDed with the
destination operand. The result is stored in the destination
location.`,
      lea: `LEA-Load Effective Address
Syntax: LEA <ea>,An
Size: Long
The LEA instruction does not affect any condition codes.
The effective address is loaded into the specified address
register.`,
      move: `MOVE-Move Data from Source to Destination
Syntax: MOVE <source ea>, <destination ea>
Size: Byte, Word or Long

Condition Codes:
N-Set if the result is negative, otherwise cleared.
Z-Set if the result is zero, otherwise cleared.
V-Always cleared.
C-Always cleared.
X-Unaffected.

The operand at <source ea> is moved to the location at
<destination ea>. The data is examined as it is moved and
the condition codes set appropriately.

All addressing modes can be used for the <source ea>
with the exception that Address Register Direct
addressing cannot be used for byte size operations.

Only data alterable addressing modes can be used for the
<destination ea>.`,
      movem: `MOVEM-Move Multiple Registers
MOVEM moves multiple registers to memory or moves
multiple words of memory to registers. It is used as a high
speed register save and restore mechanism.

Syntax: MOVEM <Register List>, <ea>
MOVEM <ea>, <Register List>

Size: Word or Long

The MOVEM instruction does not affect any condition
codes.

Selected registers are moved to or from consecutive
memory locations starting at the location specified by the
effective address. Registers to be moved are selected by a
register selection mask which is described below. The size
field of the instruction selects how much of a register is to
be moved. Either the entire register is moved or just the
low order word. If a word sized transfer is being made to
the registers, each word is sign-extended to 32 bits and the
resulting long word is moved to the register.

MOVEM can use control addressing mode, post-
increment mode or pre-decrement mode. If the effective
address is in one of the control modes, the registers are
moved starting at the effective address and up through
higher addresses. The registers are transferred in the
order DO through D7, then AO through A7.

If the effective address is the post-increment mode, only
memory to register moves are allowed. The order of
transfer is the same as for the control modes as described
in the previous paragraph. The incremented address
register is updated to contain the address of the last word
loaded plus two. 

If the effective address is the pre-decrement mode, only
register to memory moves are allowed. The registers are
moved starting at the specified address minus two, and
down through lower addresses. The order of storing the
registers is from A7 down to AO, then from 07 down to DO.
The decremented address register is updated to contain
the address of the last word stored.
The register list mask list is a bit map which controls which
registers are to be moved. The low order bit corresponds to
the first register to be moved, while the high order bit
corresponds to the last register to be moved. For control
and post-increment addressing modes, the mask
correspondence is:
bit~ 15 0
A7 A6 A5 A4 A3 A2 A1 AO 07 06 05 04 03 02 01 00
For the pre-decrement address nlode, the mask
correspondence is:
bit~ 15 o
00 01 02 03 04 05 06 07 AO A1 A2 A3 A4 A5 A6 A7
The register list is specified by giving lists of register
names separated by slashes. A range of registers can be
specified by giving two register names separated by a
hyphen. `,
      tst: `TST-Test an Operand
Syntax: TST <ea>
Size: Byte, Word or Long
Condition Codes:
  N-Set if the operand is negative, otherwise
cleared.
  Z-Set if the operand is zero, otherwise cleared.
  V-Always cleared.
  C-Always cleared.
  X-Unaffected.
The operand specified by <ea> is compared with zero and
the condition codes set as a result of the test. Only data
alterable addressing modes can be used by the TST
instruction.`,
    };

    branchInstructions.forEach((bi) => (descriptions[bi] = branchDescription));

    decrementAndBranchInstructions.forEach(
      (bi) => (descriptions[bi] = decrementAndBranchDescription)
    );

    const title = descriptions[mnemonic.split(".")[0]];
    if (!title) {
      return;
    }

    new bootstrap.Tooltip(event.target, {
      title,
      container: "body",
      sanitize: false,
      customClass: "asm-tooltip",
    }).show();
  }

  displayExplainTooltip(event, title) {
    if (!title) {
      return;
    }

    new bootstrap.Tooltip(event.target, {
      title,
      container: "body",
      sanitize: false,
      customClass: "asm-tooltip",
    }).show();
  }

  onOpClick(event, op) {
    this.showAsm(op);
  }

  /**
   * @param {string} address
   */
  async showAsm(address) {
    if (address.indexOf("0x") === -1) {
      address = "0x" + address;
    }

    const data = await WsService.getAsm(address);
    // Adding 100 because we get 100 extra instructions on each side around address
    this.disasmWindow.scrollTo(0, (data.index + 100) * 24);
  }
}

export const AsmViewerComponent = {
  template: `
    <div class="disasm-window overflow-y-scroll" style="position: relative">
        <div class="code-overlay w-100" style="position: absolute">
            <div
              class="debug-line"
              style="top: {{ $ctrl.debugLineTop }}px"
            ></div>
            <div
              ng-if="$ctrl.branchLineTop"
              class="branch-line"
              style="top: {{ $ctrl.branchLineTop }}px; height: {{ $ctrl.branchLineHeight }}px"
            ></div>
        </div>
        <div class="code-listing" style="height: {{ $ctrl.totalInstructionCount * 24 }}px">
            <div class="code-row" ng-repeat="pa in $ctrl.asm" style="top: {{ ($ctrl.firstInstructionIndex + $index) * 24 }}px">
                <span ng-if-start="pa.type === 'label'">{{pa.mnemonic}}</span>
                <button ng-if-end
                  ng-if="pa.references.length" 
                  class="btn btn-link p-0"
                  ng-click="$ctrl.onReferencesClick($event, pa.references)"
                >
                  {{pa.references.length}} reference{{pa.references.length > 1 ? 's' : ''}}
                </button>

                <span ng-if-start="pa.type !== 'label'" class="addr">
                    0x{{pa.address.toString(16)}}:
                </span>
                <span ng-if="$ctrl.showBytes" class="bytes">
                    {{pa.bytes}}
                </span>
                <span class="mnemonic" ng-mouseover="$ctrl.displayTooltip($event, pa.mnemonic)">
                    {{pa.mnemonic}}
                </span>
                <span ng-if="!pa.op_1" class="op_str">
                    {{pa.op_str}}
                </span>
                <button class="btn btn-link p-0" ng-if="pa.op_1" ng-click="$ctrl.onOpClick($event, pa.op_1)">
                    {{pa.op_str}}
                </button>
                <span ng-if-end ng-mouseover="$ctrl.displayExplainTooltip($event, pa.valTooltip)">
                    {{pa.explain}}
                </span>
            </div>
        </div>
    </div>`,
  bindings: {
    regs: "<",
    asm: "<",
    showBytes: "<",
    firstInstructionIndex: "<",
    totalInstructionCount: "<",
  },
  controller: AsmViewerController,
};
