
#ifndef _CAPSTONE_H_
#define _CAPSTONE_H_

void disasm_rom_as_json(uint32_t address, uint16_t length, char **jsonOut);

#endif /* _CAPSTONE_H_ */
