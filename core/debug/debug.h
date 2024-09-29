
#ifndef _DEBUG_H_
#define _DEBUG_H_

#include "cpuhook.h"
#include <setjmp.h>

void process_breakpoints(hook_type_t type, int width, unsigned int address, unsigned int value);
void visualize_ym2612(unsigned int address, unsigned int value);
jmp_buf jmp_env;
// Skip to the next assembly instruction
int dbg_trace;
// Skip over a subroutine call
int dbg_step_over;
// Skip over a source code line - requires DWARF info
int dbg_step_over_line;
// Indicates that we are inside the interrupt code - debugger uses this flag to prevent breaking in interrupts
int dbg_in_interrupt;
// Can be toggled on and off from client
int break_in_interrupt;
// Stops the execution
int dbg_paused;

typedef enum
{
    DBG_STEP = 0,
    DBG_YM2612 = 1
} dbg_event_t;

void set_debug_hook(void(*hook)(dbg_event_t type, void *data));
unsigned char read_memory_byte(unsigned int address, char* type);
void write_memory_byte(unsigned int address, unsigned int value, char *memtype);
unsigned char* read_memory(unsigned int size, unsigned int address);

typedef struct breakpoint_s {
    struct breakpoint_s *next, *prev;
    int enabled;
    int width;
    hook_type_t type;
    unsigned int address;
    int condition_provided;
    unsigned int value_equal;
    // Will be deleted after hit once
    int once;
} breakpoint_t;

breakpoint_t *add_bpt(hook_type_t type, unsigned int address, int width, int condition_provided, unsigned int value_equal);
void delete_breakpoint_with_address(unsigned int address);

void clear_bpt_list();

#endif /* _DEBUG_H_ */
