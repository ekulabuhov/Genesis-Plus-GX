#ifndef _EXTRACT_FUNCTION_H_
#define _EXTRACT_FUNCTION_H_

// For cs_insn
#include <capstone/capstone.h>
// For rom_reader
#include "rom_analyzer.h"

struct Function
{
    int start_address;
    int end_address;
    int referenced_from;
    // Branches to other functions
    struct FromTo *functions;
    // Local branches (jumptables and labels)
    struct Branches *branches;
    int function_count;
    int function_size;

    cs_insn **instructions;
    int instruction_count;
};

struct Function extract_function(int referenced_from, int address, rom_reader read_rom);

#endif /* _EXTRACT_FUNCTION_H_ */
