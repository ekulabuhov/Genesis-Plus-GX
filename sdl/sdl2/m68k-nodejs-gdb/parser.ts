import fs from "node:fs";
import { OffsetBuffer } from "./buffer";
import { ENUM_DW_AT, ENUM_DW_FORM, ENUM_DW_TAG, ValueOf } from "./enums";

export interface AbbrevTable {
  [decl_code: number]: AbbrevRecord;
}

interface AbbrevRecord {
  decl_code: number;
  tag: ValueOf<typeof ENUM_DW_TAG>;
  children_flag: number;
  attr_spec: AttrSpec[];
}

interface AttrSpec {
  name: ValueOf<typeof ENUM_DW_AT>;
  form: ValueOf<typeof ENUM_DW_FORM>;
  value?: number;
}

export interface RelocationRecord {
  r_offset: number;
  r_info: number;
  r_addend: number;
}

export interface Section {
  sh_name: number;
  sh_type: number;
  sh_offset: number;
  sh_size: number;
  sectionName: string;
  sh_link: number;
}

export interface DIE {
  abbrev_code: number;
  tag: ValueOf<typeof ENUM_DW_TAG>;
  attributes: Partial<{
    [key in ValueOf<typeof ENUM_DW_AT>]: {
      value?: string | number;
      offset: string;
      form: ValueOf<typeof ENUM_DW_FORM>;
    };
  }>;
  has_children: boolean;
  parent?: DIE;
  children?: DIE[];
}

interface DebugLineTable {
  default_is_stmt: number;
  opcode_base: number;
  program_start_offset: number;
  program_end_offset: number;
  maximum_operations_per_instruction: number;
  minimum_instruction_length: number;
  line_base: number;
  line_range: number;
  file_entry: FileEntry[];
  include_directory: string[];
}

interface FileEntry {
  name: string;
  dir_index: number;
  mtime: number;
  length: number;
}

export interface DebugInfoTable {
  offset: string;
  unit_length: number;
  version: number;
  unit_type: number;
  debug_abbrev_offset: number;
  dies: () => DIE[];
  cu_die_offset: number;
  top_level_die: DIE;
}

// Line program opcodes
const DW_LNS_copy = 0x01;
const DW_LNS_advance_pc = 0x02;
const DW_LNS_advance_line = 0x03;
const DW_LNS_set_file = 0x04;
const DW_LNS_set_column = 0x05;
const DW_LNS_negate_stmt = 0x06;
const DW_LNS_set_basic_block = 0x07;
const DW_LNS_const_add_pc = 0x08;
const DW_LNS_fixed_advance_pc = 0x09;
const DW_LNS_set_prologue_end = 0x0a;
const DW_LNS_set_epilogue_begin = 0x0b;
const DW_LNS_set_isa = 0x0c;
const DW_LNE_end_sequence = 0x01;
const DW_LNE_set_address = 0x02;
const DW_LNE_define_file = 0x03;
const DW_LNE_set_discriminator = 0x04;
const DW_LNE_lo_user = 0x80;
const DW_LNE_hi_user = 0xff;

export class LineState {
  address: number;
  file: number;
  line: number;
  column: number;
  op_index: number;
  is_stmt: boolean;
  basic_block: boolean;
  end_sequence: boolean;
  prologue_end: boolean;
  epilogue_begin: boolean;
  isa: number;
  discriminator: number;

  constructor(default_is_stmt: boolean) {
    this.address = 0;
    this.file = 1;
    this.line = 1;
    this.column = 0;
    this.op_index = 0;
    this.is_stmt = default_is_stmt;
    this.basic_block = false;
    this.end_sequence = false;
    this.prologue_end = false;
    this.epilogue_begin = false;
    this.isa = 0;
    this.discriminator = 0;
  }
}

export class Parser {
  buffer: Buffer;

  constructor(private outFilePath: string) {
    this.buffer = fs.readFileSync(outFilePath);
  }

  parseSections() {
    // Points to the start of the section header table.
    const e_shoff = this.buffer.readUInt32BE(0x20);
    // Contains the size of a section header table entry. As explained below, this will typically be 0x28 (32 bit) or 0x40 (64 bit).
    const e_shentsize = this.buffer.readInt16BE(0x2e);
    // Contains the number of entries in the section header table.
    const e_shnum = this.buffer.readInt16BE(0x30);

    const sections: Section[] = [];
    for (let index = 0; index < e_shnum; index++) {
      const sectionOffset = e_shoff + index * e_shentsize;
      const section = this.parseSection(sectionOffset);
      const { sh_type } = section;

      if (sh_type === 0) continue;

      sections.push(section);
    }

    return sections;
  }

  parseSection(offset: number, resolveName = true) {
    // An offset to a string in the .shstrtab section that represents the name of this section.
    const sh_name = this.buffer.readUInt32BE(offset);
    // Identifies the type of this header.
    const sh_type = this.buffer.readUInt32BE(offset + 4);
    // Offset of the section in the file image.
    const sh_offset = this.buffer.readUInt32BE(offset + 0x10);
    // Size in bytes of the section. May be 0.
    const sh_size = this.buffer.readUInt32BE(offset + 0x14);
    // Contains the section index of an associated section. This field is used for several purposes, depending on the type of section.
    const sh_link = this.buffer.readUInt32BE(offset + 0x18);

    return {
      sh_name,
      sh_type,
      sh_offset,
      sh_size,
      sectionName: resolveName ? this.getSectionName(sh_name) : "",
      sh_link,
    };
  }

  getSectionName(offset: number) {
    // Contains index of the section header table entry that contains the section names.
    const e_shstrndx = this.buffer.readInt16BE(0x32);
    // Contains the size of a section header table entry. As explained below, this will typically be 0x28 (32 bit) or 0x40 (64 bit).
    const e_shentsize = this.buffer.readInt16BE(0x2e);
    // Points to the start of the section header table.
    const e_shoff = this.buffer.readUInt32BE(0x20);

    const sectionNamesOffset = e_shstrndx * e_shentsize + e_shoff;
    const { sh_offset } = this.parseSection(sectionNamesOffset, false);

    offset += sh_offset;
    const nullTerm = this.buffer.indexOf(0, offset);
    const sectionName = this.buffer.toString("utf8", offset, nullTerm);
    return sectionName;
  }

  /**
   * For each compilation unit compiled with a DWARF producer, a contribution is
   * made to the .debug_info section of the object file. Each such contribution
   * consists of a compilation unit header (see Section 7.5.1.1 on page 200) followed
   * by a single DW_TAG_compile_unit or DW_TAG_partial_unit debugging
   * information entry, together with its children.
   */
  parseDebugInfo(
    offset: number,
    debugInfoRelocationTable: RelocationRecord[] | undefined,
    debugStrOffset: number,
    debugAbbrevSectionOffset: number
  ): DebugInfoTable {
    // A 4-byte unsigned integer representing the length of the .debug_info contribution for that compilation unit, not including the length 5 field itself.
    const unit_length = this.buffer.readUInt32BE(offset);
    const version = this.buffer.readUInt16BE(offset + 4);
    const unit_type = this.buffer.readUInt8(offset + 6);
    // A 4-byte or 8-byte unsigned offset into the .debug_abbrev section.
    const debug_abbrev_offset = this.buffer.readUInt32BE(offset + 8);
    const cu_die_offset = offset + 12;

    const debugAbbrevTable = this.parseAbbrevTable(
      debugAbbrevSectionOffset + debug_abbrev_offset
    );
    // debugPrintAbbrevTable(debugAbbrevTable);

    if (debugInfoRelocationTable) {
      // Apply relocation table
      debugInfoRelocationTable.forEach((reloc) => {
        this.buffer.writeInt32BE(reloc.r_addend, offset + reloc.r_offset);
      });
    }

    const dies = (top_level_only = false) => {
      const { dies } = this.parseDIE(
        cu_die_offset,
        debugAbbrevTable,
        debugStrOffset,
        undefined,
        top_level_only
      );
      return dies;
    };

    const top_level_die = dies(true)[0];

    return {
      offset: "0x" + offset.toString(16),
      unit_length,
      version,
      unit_type,
      debug_abbrev_offset,
      dies,
      cu_die_offset,
      top_level_die,
    };
  }

  // Parses Debug Information Entry
  parseDIE(
    offset: number,
    debugAbbrevTable: AbbrevTable,
    debugStrOffset: number,
    parent?: DIE,
    top_level_only = false
  ) {
    const dies: DIE[] = [];
    while (true) {
      // Should be ULEB128
      const abbrev_code = this.buffer.readUInt8(offset++);
      if (abbrev_code === 0) {
        break;
      }

      const tag = debugAbbrevTable[abbrev_code];
      const die: DIE = {
        abbrev_code,
        tag: tag.tag,
        attributes: {},
        has_children: !!tag.children_flag,
        parent,
      };

      tag.attr_spec.forEach(({ name, form, value: spec_value }) => {
        const { raw_value, advance } = this.dwFormRead(
          form,
          this.buffer,
          offset
        );
        let value;
        if (form === "DW_FORM_strp") {
          // read value from debug_str
          if (typeof raw_value !== "number") return;
          const nullTerm = this.buffer.indexOf(0, debugStrOffset + raw_value);
          value = this.buffer.toString(
            "utf8",
            debugStrOffset + raw_value,
            nullTerm
          );
        } else if (form === "DW_FORM_implicit_const") {
          // Special case here: the attribute value is stored in the attribute
          // definition in the abbreviation spec, not in the DIE itself.
          value = spec_value;
        } else {
          value = raw_value;
        }
        die.attributes[name] = {
          value,
          offset:
            "0x" + (offset - 0x66).toString(16) + ` (0x${offset.toString(16)})`,
          form,
        };
        offset += advance;
      });

      dies.push(die);

      if (top_level_only) {
        return { dies, offset };
      }

      if (die.has_children) {
        const { dies, offset: last_offset } = this.parseDIE(
          offset,
          debugAbbrevTable,
          debugStrOffset,
          die
        );
        die.children = dies;
        offset = last_offset;
      }

      // Top DIE doesn't have a null terminator
      if (!parent) {
        break;
      }
    }

    return { dies, offset };
  }

  dwFormRead(
    form: ValueOf<typeof ENUM_DW_FORM>,
    buffer: Buffer,
    offset: number
  ) {
    switch (form) {
      case "DW_FORM_strp":
      case "DW_FORM_addr":
      case "DW_FORM_data4":
      case "DW_FORM_sec_offset":
      case "DW_FORM_ref4":
        return {
          raw_value: buffer.readUInt32BE(offset),
          advance: 4,
        };
      case "DW_FORM_data1":
        return {
          raw_value: buffer.readUInt8(offset),
          advance: 1,
        };
      case "DW_FORM_data2":
        return {
          raw_value: buffer.readUInt16BE(offset),
          advance: 2,
        };
      case "DW_FORM_string":
        const nullTerm = buffer.indexOf(0, offset);
        const raw_value = buffer.toString("utf8", offset, nullTerm);
        return {
          raw_value,
          advance: raw_value.length + 1,
        };
      case "DW_FORM_implicit_const":
        return {
          advance: 0,
        };
      case "DW_FORM_flag_present":
        return {
          raw_value: 1,
          advance: 0,
        };
      case "DW_FORM_exprloc":
        const length = buffer.readUInt8(offset++);
        const value = buffer.toString("hex", offset, offset + length);
        return {
          raw_value: `${length} byte block: ${value}`,
          advance: 1 + length,
        };
      default:
        throw new Error(`${form} at 0x${offset.toString(16)} is unsupported`);
    }
  }

  parseRelocationTable(offset: number, size: number) {
    const relocationTable: RelocationRecord[] = [];
    while (size) {
      const r_offset = this.buffer.readInt32BE(offset);
      const r_info = this.buffer.readInt32BE(offset + 4);
      const r_addend = this.buffer.readInt32BE(offset + 8);
      offset += 12;
      size -= 12;
      relocationTable.push({
        r_offset,
        r_info,
        r_addend,
      });
    }

    return relocationTable;
  }

  parseAbbrevTable(offset: number) {
    const abbrevTable: AbbrevTable = {};
    while (true) {
      // Should be ULEB128
      const decl_code = this.buffer.readUInt8(offset++);
      if (decl_code === 0) {
        break;
      }

      const tag =
        ENUM_DW_TAG[
          this.buffer.readUint8(offset++) as keyof typeof ENUM_DW_TAG
        ];
      const children_flag = this.buffer.readUInt8(offset++);

      const attr_spec: AttrSpec[] = [];
      while (true) {
        const name =
          ENUM_DW_AT[
            this.buffer.readUint8(offset++) as keyof typeof ENUM_DW_AT
          ];
        const form =
          ENUM_DW_FORM[
            this.buffer.readUint8(offset++) as keyof typeof ENUM_DW_FORM
          ];
        if (name === "DW_AT_null" && form === "DW_FORM_null") {
          break;
        }
        if (form === "DW_FORM_implicit_const") {
          attr_spec.push({
            name,
            form,
            value: this.buffer.readUint8(offset++),
          });
          continue;
        }
        attr_spec.push({ name, form });
      }

      abbrevTable[decl_code] = {
        decl_code,
        tag,
        children_flag,
        attr_spec,
      };
    }

    return abbrevTable;
  }

  parseDebugLineTable(offset: number): DebugLineTable {
    const o_buffer = new OffsetBuffer(offset, this.buffer);
    const unit_length = o_buffer.readUInt32BE();
    const version = o_buffer.readUInt16BE();
    const header_length = o_buffer.readUInt32BE();
    const minimum_instruction_length = o_buffer.readUInt8();
    const maximum_operations_per_instruction = 1;
    const default_is_stmt = o_buffer.readUInt8();
    const line_base = o_buffer.readInt8();
    const line_range = o_buffer.readUInt8();
    const opcode_base = o_buffer.readUInt8();

    const standard_opcode_lengths = o_buffer.subarray(opcode_base - 1);

    const include_directory: string[] = [];
    while (o_buffer.peek() !== 0) {
      include_directory.push(o_buffer.readCString());
    }
    o_buffer.readUInt8();

    const file_entry: FileEntry[] = [];
    while (o_buffer.peek() !== 0) {
      file_entry.push({
        name: o_buffer.readCString(),
        dir_index: o_buffer.readUInt8(),
        mtime: o_buffer.readUInt8(),
        length: o_buffer.readUInt8(),
      });
    }
    o_buffer.readUInt8();

    const program_start_offset = o_buffer.tell();
    const program_end_offset = unit_length + offset + 4;

    return {
      default_is_stmt,
      opcode_base,
      program_start_offset,
      program_end_offset,
      maximum_operations_per_instruction,
      minimum_instruction_length,
      line_base,
      line_range,
      file_entry,
      include_directory,
    };
  }

  *iter_CUs_gen(
    debugInfoSection: Section,
    debugInfoRelocationTable: RelocationRecord[] | undefined,
    debugStrOffset: number,
    debugAbbrevSectionOffset: number
  ) {
    // 557388
    let offset = debugInfoSection.sh_offset;

    while (offset < debugInfoSection.sh_offset + debugInfoSection.sh_size) {
      const debugInfoTable = this.parseDebugInfo(
        offset,
        debugInfoRelocationTable,
        debugStrOffset,
        debugAbbrevSectionOffset
      );
      offset += debugInfoTable.unit_length + 4;
      yield debugInfoTable;
    }
  }

  decodeLineProgram(
    header: { default_is_stmt: number; opcode_base: number },
    self: {
      program_start_offset: number;
      program_end_offset: number;
      maximum_operations_per_instruction: number;
      opcode_base: number;
      minimum_instruction_length: number;
      line_base: number;
      line_range: number;
    }
  ) {
    const entries: LineState[] = [];
    let state = new LineState(!!header.default_is_stmt);

    function add_entry_new_state(cmd: number, args: number[]) {
      entries.push({ ...state });
      state.discriminator = 0;
      state.basic_block = false;
      state.prologue_end = false;
      state.epilogue_begin = false;
    }

    const o_buffer = new OffsetBuffer(self.program_start_offset, this.buffer);
    while (o_buffer.tell() < self.program_end_offset) {
      const opcode = o_buffer.readUInt8();
      let operand;

      if (opcode >= header.opcode_base) {
        // Special opcode (follow the recipe in 6.2.5.1)
        const maximum_operations_per_instruction =
          self["maximum_operations_per_instruction"];
        const adjusted_opcode = opcode - self["opcode_base"];
        const operation_advance = Math.floor(
          adjusted_opcode / self["line_range"]
        );
        const address_addend =
          self["minimum_instruction_length"] *
          Math.floor(
            (state.op_index + operation_advance) /
              maximum_operations_per_instruction
          );
        state.address += address_addend;
        state.op_index =
          (state.op_index + operation_advance) %
          maximum_operations_per_instruction;
        const line_addend =
          self["line_base"] + (adjusted_opcode % self["line_range"]);
        state.line += line_addend;
        add_entry_new_state(opcode, [
          line_addend,
          address_addend,
          state.op_index,
        ]);
      } else if (opcode === 0) {
        // Extended opcode: start with a zero byte, followed by
        // instruction size and the instruction itself.
        const inst_len = o_buffer.readUleb128();
        const ex_opcode = o_buffer.readUInt8();

        switch (ex_opcode) {
          case DW_LNE_end_sequence:
            state.end_sequence = true;
            state.is_stmt = false;
            add_entry_new_state(ex_opcode, []);
            // reset state
            state = new LineState(!!header["default_is_stmt"]);
            break;
          case DW_LNE_set_address:
            operand = o_buffer.readUInt32BE();
            state.address = operand;
            break;
          case DW_LNE_set_discriminator:
            operand = o_buffer.readUleb128();
            state.discriminator = operand;
            break;

          default:
            throw new Error(
              `Extended ${opcode} at offset ${o_buffer.tell()} is not supported `
            );
        }
      } else {
        let address_addend;
        switch (opcode) {
          case DW_LNS_copy:
            add_entry_new_state(opcode, []);
            break;
          case DW_LNS_advance_pc:
            operand = o_buffer.readUleb128();
            address_addend = operand * self["minimum_instruction_length"];
            state.address += address_addend;
            break;
          case DW_LNS_advance_line:
            operand = o_buffer.readSleb128();
            state.line += operand;
            break;
          case DW_LNS_set_column:
            operand = o_buffer.readUleb128();
            state.column = operand;
            break;
          case DW_LNS_negate_stmt:
            state.is_stmt = !state.is_stmt;
            break;
          case DW_LNS_const_add_pc:
            const adjusted_opcode = 255 - self["opcode_base"];
            address_addend =
              Math.floor(adjusted_opcode / self["line_range"]) *
              self["minimum_instruction_length"];
            state.address += address_addend;
            break;

          default:
            throw new Error(
              `${opcode} at offset ${o_buffer.tell()} is not supported `
            );
        }
      }
    }

    return entries;
  }
}
