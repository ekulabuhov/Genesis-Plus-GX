#ifndef _DWARF_H_
#define _DWARF_H_

typedef struct
{
    char function_name[0x100];
    char file_path[0x100];
    unsigned int line_number;
    unsigned int column;
} dwarf_ask_t;

int dwarf_init(void);
dwarf_ask_t *dwarf_ask(unsigned int address);

#endif
