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

// If set will execute one instruction and pause
int dbg_trace;
// If set will prevent instruction from executing and jump to main SDL loop
int dbg_paused;
// If set we are in the middle of the interrupt
int dbg_in_interrupt;
// Callback that is executed each time debug event happens (e.g. step)
void (*debug_hook)(dbg_event_t type) = NULL;

static breakpoint_t *first_bp = NULL;

breakpoint_t *add_bpt(hook_type_t type, unsigned int address, int width) {
    breakpoint_t *bp = (breakpoint_t *)malloc(sizeof(breakpoint_t));

    bp->type = type;
    bp->address = address;
    bp->width = width;
    bp->enabled = 1;

    if (first_bp) {
        bp->next = first_bp;
        bp->prev = first_bp->prev;
        first_bp->prev = bp;
        bp->prev->next = bp;
    }
    else {
        first_bp = bp;
        bp->next = bp;
        bp->prev = bp;
    }

    return bp;
}

static breakpoint_t *next_breakpoint(breakpoint_t *bp) {
    return bp->next != first_bp ? bp->next : 0;
}

static void delete_breakpoint(breakpoint_t * bp) {
    if (bp == first_bp) {
        if (bp->next == bp) {
            first_bp = NULL;
        }
        else {
            first_bp = bp->next;
        }
    }

    bp->next->prev = bp->prev;
    bp->prev->next = bp->next;

    free(bp);
}

void clear_bpt_list() {
    while (first_bp != NULL) delete_breakpoint(first_bp);
}

void check_breakpoint(hook_type_t type, int width, unsigned int address, unsigned int value)
{
    breakpoint_t *bp;
    for (bp = first_bp; bp; bp = next_breakpoint(bp)) {
        if (!(bp->type & type) || !bp->enabled) continue;
        if ((address <= (bp->address + bp->width)) && ((address + width) >= bp->address)) {
            dbg_paused = 1;
            break;
        }
    }
}

void process_breakpoints(hook_type_t type, int width, unsigned int address, unsigned int value)
{
    switch (type)
    {
    case HOOK_M68K_E:
        if (dbg_in_interrupt) {
            unsigned int pc = REG_PC;
            unsigned short opc = m68k_read_immediate_16(pc);

            if (opc != 0x4E73) { // rte
                break;
            }

            dbg_in_interrupt = 0; // we at rte
            break;
        }

        if (!dbg_trace) {
            // Will set dbg_paused if hit
            check_breakpoint(type, width, address, value);
        }

        if (dbg_paused)
        {
            dbg_paused = 0;
            debug_hook(DBG_STEP);
            // Jump to main SDL loop
            longjmp(jmp_env, 1);
        }

        if (dbg_trace)
        {
            dbg_trace = 0;
            dbg_paused = 1;
            break;
        }

        break;
    default:
        check_breakpoint(type, width, address, value);
        break;
    }
}

void set_debug_hook(void (*hook)(dbg_event_t type))
{
    debug_hook = hook;
}

unsigned char read_memory_byte(unsigned int address)
{
    return m68ki_read_8(address);
}

void write_memory_byte(unsigned int address, unsigned int value)
{
    return m68ki_write_8(address, value);
}

unsigned char *read_memory(unsigned int address, unsigned int size)
{
    unsigned char *bytes = malloc(size);
    for (unsigned int i = 0; i < size; i++)
    {
        bytes[i] = m68ki_read_8(address + i);
    }

    return bytes;
}
