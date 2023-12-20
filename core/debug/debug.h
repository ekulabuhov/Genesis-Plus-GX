
#ifndef _DEBUG_H_
#define _DEBUG_H_

#include "cpuhook.h"
#include <setjmp.h>

void process_breakpoints(hook_type_t type, int width, unsigned int address, unsigned int value);
jmp_buf jmp_env;
int dbg_trace;
int dbg_in_interrupt;

typedef enum {
	DBG_STEP = 0
} dbg_event_t;

void set_debug_hook(void(*hook)(dbg_event_t type));
unsigned char read_memory_byte(unsigned int address);
void write_memory_byte(unsigned int address, unsigned int value);
unsigned char* read_memory(unsigned int address, unsigned int size);

#endif /* _DEBUG_H_ */
