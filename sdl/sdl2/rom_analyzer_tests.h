#ifndef _ROM_ANALYZER_TEST_H_
#define _ROM_ANALYZER_TEST_H_

#include <capstone/capstone.h>

struct Function
{
    int start_address;
    int end_address;
    int referenced_from;
    struct FromTo *functions;
    int function_count;
    int function_size;

    cs_insn **instructions;
    int instruction_count;
};

typedef unsigned char *(*rom_reader)(unsigned int length, unsigned int address);
struct Function extract_function(int length, int address, rom_reader read_rom);

rom_reader init_file_reader(char *filename);

#endif /* _ROM_ANALYZER_TEST_H_ */
