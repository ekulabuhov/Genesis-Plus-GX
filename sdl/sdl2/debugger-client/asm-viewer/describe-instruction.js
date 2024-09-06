/**
 * @param {string} mnemonic
 */
export function describeInstruction(mnemonic) {
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
      ext: `Extends a byte in a data register to a word or a long word, or a word in a data
register to a long word, by replicating the sign bit to the left. If the operation extends a
byte to a word, bit 7 of the designated data register is copied to bits 15 – 8 of that data
register. If the operation extends a word to a long word, bit 15 of the designated data
register is copied to bits 31 – 16 of the data register. The EXTB form copies bit 7 of the
designated register to bits 31 – 8 of the data register.`,
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
      neg: `NEG-Negate
Syntax: NEG < ea >
Size: Byte, Word or Long

Subtracts the destination operand from zero and stores the result in the
destination location. The size of the operation is specified as byte, word, or long.`,
      rst: `RTS-Return from Subroutine
Operation: (SP) → PC; SP + 4 → SP 

Pulls the program counter value from the stack. The previous program counter
value is lost. `,
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

    return descriptions[mnemonic.split(".")[0]];
}