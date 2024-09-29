import { _FORM_CLASS } from "./enums";
import {
  DIE,
  DebugInfoTable,
  LineState,
  Parser,
  RelocationRecord,
  Section,
} from "./parser";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

function main() {
  // console.log("current working directory: " + __dirname);
  const parser = new Parser(__dirname + "/../out/rom.out");

  const allSections = parser.parseSections();

  const debugInfoSection = findSection(allSections, ".debug_info");
  const debugInfoRelocationSection = findSectionOptional(
    allSections,
    ".rela.debug_info"
  );

  let debugInfoRelocationTable: RelocationRecord[] | undefined;
  if (debugInfoRelocationSection) {
    debugInfoRelocationTable = parser.parseRelocationTable(
      debugInfoRelocationSection.sh_offset,
      debugInfoRelocationSection.sh_size
    );
    // debugPrintRelocationTable(debugInfoRelocationTable);
  }

  const debugAbbrevSection = findSection(allSections, ".debug_abbrev");
  const debugStrSection = findSection(allSections, ".debug_str");

  const iter_CUs = () =>
    parser.iter_CUs_gen(
      debugInfoSection,
      debugInfoRelocationTable,
      debugStrSection.sh_offset,
      debugAbbrevSection.sh_offset
    );

  const debugLineSection = findSection(allSections, ".debug_line");

  // Decode an address in an ELF file to find out which function it belongs to
  // and from which filename/line it comes in the original source file.

  if (process.argv[2]) {
    const address = parseInt(process.argv[2], 16);
    console.log("looking for", address, "0x" + address.toString(16));
    return decode(address);
  }
  

  const rl = readline.createInterface({ input, output });

  // output.write('hello\n');
  rl.on("line", (answer) => {
    console.log({ answer });
    if (answer === "quit") {
      console.log("quitting");
      rl.close();
      return;
    }

    const address = parseInt(answer, 16);
    console.log("looking for", address, "0x" + address.toString(16));
    decode(address);
  });

  function decode(address: number) {
    try {
      const decoded = decode_funcname(iter_CUs(), address);
      if (!decoded) {
        console.log(">not found in decode_funcname");
        return;
      }

      const { funcname, cu } = decoded;
      console.log("funcname:", funcname);
      const filenameAndline = decode_file_line(
        cu,
        debugLineSection.sh_offset,
        address,
        parser
      );

      if (!filenameAndline) {
        console.log(">not found in decode_file_line, funcname:", funcname);
        return;
      }

      const { filename, line, column } = filenameAndline;
      // console.log({ funcname, filename, line });
      console.log(`>${funcname} ${filename} ${line} ${column}`);
    } catch (error: any) {
      console.log(error);
      console.log(">not found");
    }
  }

  // 0x2028 main in main.c:5
  // 0x204c BMP_init in bmp.c:85
}

function decode_file_line(
  cu: DebugInfoTable,
  debugLineSectionOffset: number,
  address: number,
  parser: Parser
) {
  const stmt_list_offset = cu.top_level_die.attributes.DW_AT_stmt_list;
  if (!stmt_list_offset || typeof stmt_list_offset.value !== "number") {
    return;
  }

  const debugLineTable = parser.parseDebugLineTable(
    debugLineSectionOffset + stmt_list_offset.value
  );
  const lineProg = parser.decodeLineProgram(debugLineTable, debugLineTable);

  let prevstate: LineState | undefined;
  for (const state of lineProg) {
    // Looking for a range of addresses in two consecutive states that
    // contain the required address.
    if (prevstate && prevstate.address <= address && address < state.address) {
      const fileEntry = debugLineTable.file_entry[prevstate.file - 1];
      const directory = debugLineTable.include_directory[fileEntry.dir_index - 1];
      return {
        line: prevstate.line,
        filename: directory + '/' + fileEntry.name,
        column: prevstate.column
      };
    }

    prevstate = state;
  }
}

function decode_funcname(
  iter_CUs: Generator<DebugInfoTable, void, unknown>,
  address: number
) {
  for (const cu of iter_CUs) {
    // Quick check if DW_TAG_compile_unit covers our address
    if (!addressBetweenLowAndHighPc(cu.top_level_die, address)) {
      continue;
    }

    const flattened = flattenDies(cu.dies());
    for (const die of flattened) {
      if (die.tag === "DW_TAG_subprogram") {
        if (addressBetweenLowAndHighPc(die, address)) {
          return { funcname: die.attributes.DW_AT_name?.value, cu };
        }
      }
    }
  }
}

function addressBetweenLowAndHighPc(die: DIE, address: number) {
  const lowpc = die.attributes.DW_AT_low_pc?.value as number;

  // DWARF v4 in section 2.17 describes how to interpret the
  // DW_AT_high_pc attribute based on the class of its form.
  // For class 'address' it's taken as an absolute address
  // (similarly to DW_AT_low_pc); for class 'constant', it's
  // an offset from DW_AT_low_pc.
  const highpc_attr = die.attributes.DW_AT_high_pc;
  if (!highpc_attr || typeof highpc_attr.value !== "number") {
    return false;
  }

  const highpc_attr_class =
    _FORM_CLASS[highpc_attr.form as keyof typeof _FORM_CLASS];
  let highpc = 0;

  if (highpc_attr_class == "address") {
    highpc = highpc_attr.value;
  } else if (highpc_attr_class == "constant") {
    highpc = lowpc + highpc_attr.value;
  }

  if (address >= lowpc && address < highpc) {
    return true;
  }
}

function findSectionOptional(allSections: Section[], name: string) {
  return allSections.find((s) => s.sectionName === name);
}

function findSection(allSections: Section[], name: string) {
  const section = allSections.find((s) => s.sectionName === name);

  if (!section) {
    throw new Error(`missing ${name} section`);
  }

  return section;
}

function flattenDies(dies: DIE[]): DIE[] {
  return dies
    .map((die) =>
      die.children ? [die, flattenDies(die.children)].flat() : die
    )
    .flat();
}

main();
