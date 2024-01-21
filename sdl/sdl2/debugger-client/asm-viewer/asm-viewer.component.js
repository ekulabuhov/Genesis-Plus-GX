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
        <div class="code-listing">
            <div ng-repeat="pa in $ctrl.asm">
                <span class="addr">
                    0x{{pa.address.toString(16)}}
                </span>:
                <span class="mnemonic" ng-mouseover="$ctrl.displayTooltip($event, pa.mnemonic)">
                    {{pa.mnemonic}}
                </span>
                <span class="op_str">
                    {{pa.op_str}}
                </span>
            </div>
        </div>
    </div>`,
  bindings: {
    regs: "<",
    asm: "<"
  },
  controller: class AsmViewerController {
    /** @type {{address: number; mnemonic: string; op_str: string; }[]} asm */
    asm = [];
    debugLineTop = 0;
    branchLineTop = 0;
    branchLineHeight = 0;
    /** @type {import("../index").regs} */
    regs;

    $onChanges(changesObj) {
      if (changesObj["regs"]?.currentValue || changesObj["asm"]?.currentValue) {
        this.refresh();
      }
    }

    refresh() {
      if (!this.regs.pc) {
        return;
      }

      this.branchLineHeight = this.branchLineTop = undefined;

      const instr = this.asm.find((a) => a.address === this.regs.pc);
      if (!instr) {
        console.log("instruction not found for ", this.regs.pc);
        /** @type {WebSocket} */
        const ws = window["ws"];
        ws.send(`asm ${this.regs.pc} 100`);
        return;
      }

      const instrIndex = this.asm.indexOf(instr);
      this.debugLineTop = instrIndex * 24 + 2;

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

      const descriptions = {
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

      branchInstructions.forEach(
        (bi) => (descriptions[bi] = branchDescription)
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
  },
};
