import { ENUM_SH_TYPE_BASE } from "./enums";
import { AbbrevTable, RelocationRecord, Section } from "./parser";

function debugPrintRelocationTable(relocationTable: RelocationRecord[]) {
  console.log({
    relocationTable: relocationTable.map((x) => ({
      r_offset: "0x" + x.r_offset.toString(16),
      r_info: "0x" + x.r_info.toString(16),
      r_addend: "0x" + x.r_addend.toString(16),
    })),
  });
}

function debugPrintSections(allSections: Section[]) {
  allSections.forEach(
    ({ sh_offset, sh_size, sh_type, sectionName, sh_link }, index) => {
      console.log({
        index,
        sh_offset: "0x" + sh_offset.toString(16),
        sh_size: "0x" + sh_size.toString(16),
        sectionName,
        sh_type: ENUM_SH_TYPE_BASE[sh_type],
        sh_link,
      });
    }
  );
}

function debugPrintAbbrevTable(abbrevTable: AbbrevTable) {
  console.dir({ abbrevTable }, { depth: null });
}