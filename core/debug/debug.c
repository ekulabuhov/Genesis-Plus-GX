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

// To read vram
#include "vdp_ctrl.h"

// If set will execute one instruction and pause
int dbg_trace;
// If set will prevent instruction from executing and jump to main SDL loop
int dbg_paused;
// If set we are in the middle of the interrupt
int dbg_in_interrupt;
// Callback that is executed each time debug event happens (e.g. step)
void (*debug_hook)(dbg_event_t type) = NULL;

static breakpoint_t *first_bp = NULL;

breakpoint_t *add_bpt(hook_type_t type, unsigned int address, int width, int condition_provided, unsigned int value_equal)
{
    breakpoint_t *bp = (breakpoint_t *)malloc(sizeof(breakpoint_t));

    bp->type = type;
    bp->address = address;
    bp->width = width;
    bp->enabled = 1;

    bp->condition_provided = condition_provided;
    bp->value_equal = value_equal;

    if (first_bp)
    {
        bp->next = first_bp;
        bp->prev = first_bp->prev;
        first_bp->prev = bp;
        bp->prev->next = bp;
    }
    else
    {
        first_bp = bp;
        bp->next = bp;
        bp->prev = bp;
    }

    return bp;
}

static breakpoint_t *next_breakpoint(breakpoint_t *bp)
{
    return bp->next != first_bp ? bp->next : 0;
}

static void delete_breakpoint(breakpoint_t *bp)
{
    if (bp == first_bp)
    {
        if (bp->next == bp)
        {
            first_bp = NULL;
        }
        else
        {
            first_bp = bp->next;
        }
    }

    bp->next->prev = bp->prev;
    bp->prev->next = bp->next;

    free(bp);
}

void clear_bpt_list()
{
    while (first_bp != NULL)
        delete_breakpoint(first_bp);
}

unsigned short cram_9b_to_16b(unsigned short data)
{
    /* Unpack 9-bit CRAM data (BBBGGGRRR) to 16-bit data (BBB0GGG0RRR0) */
    return (unsigned short)(((data & 0x1C0) << 3) | ((data & 0x038) << 2) | ((data & 0x007) << 1));
}

void check_breakpoint(hook_type_t type, int width, unsigned int address, unsigned int value)
{
    breakpoint_t *bp;
    for (bp = first_bp; bp; bp = next_breakpoint(bp))
    {
        if (!(bp->type & type) || !bp->enabled)
            continue;

        if (type == HOOK_CRAM_W) {
            value = cram_9b_to_16b(value);

            // CRAM writes are always 2 bytes at the time
            // If we're monitoring odd address - compare second byte only
            if (bp->width == 1 && bp->address % 2) {
                value = value & 0xFF;
            }

            printf("cram write to address %u, width: %d, value: %u\n", address, width, value);
        }

        if (type == HOOK_M68K_W) {
            printf("ram write to address %u, width: %d, value: %u\n", address, width, value);
        }
 
        if (bp->condition_provided && bp->value_equal != value) 
            continue;

        if ((address <= (bp->address + bp->width)) && ((address + width) >= bp->address))
        {
            printf("breakpoint hit at addr: %u, type: %u\n", address, type);
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
        if (dbg_in_interrupt)
        {
            unsigned int pc = REG_PC;
            unsigned short opc = m68k_read_immediate_16(pc);

            if (opc != 0x4E73)
            { // rte
                break;
            }

            dbg_in_interrupt = 0; // we at rte
            break;
        }

        if (!dbg_trace)
        {
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

static unsigned char read_cram_byte(unsigned char *array, unsigned int addr)
{
    unsigned short pp = *(unsigned short *)&array[(addr >> 1) << 1];
    return cram_9b_to_16b(pp) >> ((addr & 1) ? 0 : 8);
}

unsigned char read_memory_byte(unsigned int address, char *type)
{
    if (type != NULL)
    {
        if (strcmp(type, "vram") == 0)
        {
            return READ_BYTE(vram, address);
        }
        else if (strcmp(type, "cram") == 0)
        {
            return read_cram_byte(cram, address);
        }
    }

    return m68ki_read_8(address);
}

void write_memory_byte(unsigned int address, unsigned int value)
{
    // We can't use m68ki_write_8 as it won't allow us to write to regions where CPU is not allowed to write (e.g. ROM)
    cpu_memory_map *temp = &m68k.memory_map[((address) >> 16) & 0xff];
    WRITE_BYTE(temp->base, (address) & 0xffff, value);
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
