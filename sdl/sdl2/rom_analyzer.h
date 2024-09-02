
#ifndef _ROM_ANALYZER_H_
#define _ROM_ANALYZER_H_

typedef unsigned char *(*rom_reader)(unsigned int length, unsigned int address);
int extract_functions(int referenced_from, int address, rom_reader read_rom);
void simulate_instruction(uint32_t address, uint32_t dar[16], char *comment, rom_reader read_rom);
rom_reader init_file_reader(char *filename);

#endif /* _ROM_ANALYZER_H_ */
