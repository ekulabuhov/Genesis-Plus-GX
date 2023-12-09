#include "debug.h"
#include <stdio.h>

// Start of - To read m68k memory
#define MUL (7)
#define m68ki_cpu m68k

#include "shared.h"

#ifndef BUILD_TABLES
#include "m68ki_cycles.h"
#endif

#include "m68kconf.h"
#include "m68kcpu.h"
#include "m68kops.h"
// End of - To read m68k memory

int dbg_trace;
void(*debug_hook)(dbg_event_t type) = NULL;

void process_breakpoints(hook_type_t type, int width, unsigned int address, unsigned int value)
{
    switch (type)
    {
    case HOOK_M68K_E:
        if (dbg_trace) {
            dbg_trace = 0;
        } else {
            debug_hook(DBG_STEP);
            longjmp(jmp_env, 1);
        }

        break;

    default:
        break;
    }
}

void set_debug_hook(void (*hook)(dbg_event_t type))
{
    debug_hook = hook;
}

unsigned char read_memory_byte(unsigned int address) {
    return m68ki_read_8(address);
}

unsigned char* read_memory(unsigned int address, unsigned int size) {
    unsigned char* bytes = malloc(size);
    for (unsigned int i = 0; i < size; i++)
    {
        bytes[i] = m68ki_read_8(address + i);
    }
    
    return bytes;
}
