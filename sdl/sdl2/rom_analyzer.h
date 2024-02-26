
#ifndef _ROM_ANALYZER_H_
#define _ROM_ANALYZER_H_

typedef unsigned char *(*rom_reader)(unsigned int length, unsigned int address);
int extract_functions(int length, int address, rom_reader read_rom);

#endif /* _ROM_ANALYZER_H_ */
