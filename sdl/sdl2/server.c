// A tiny WebSocket server
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <ws.h>
#include <string.h>
#include <math.h>

// To get access to CPU registers
#include "m68k.h"
#include "storage.h"
// To unpause emu
#include "main.h"

// Imports:
// read_memory()
// read_memory_byte()
// write_memory_byte()
// set_debug_hook()
#include "debug.h"

// To access system_reset()
#include "shared.h"

// For simulate_instruction()
#include "rom_analyzer.h"

char *regs_as_json();
char *read_memory_as_json(uint32_t address, uint16_t size, char *type);
uint32_t read_number_token();

/**
 * @brief Called when a client connects to the server.
 *
 * @param client Client connection. The @p client parameter is used
 * in order to send messages and retrieve informations about the
 * client.
 */
void onopen(ws_cli_conn_t *client)
{
	char *cli, *port;
	cli = ws_getaddress(client);
	port = ws_getport(client);
#ifndef DISABLE_VERBOSE
	printf("Connection opened, addr: %s, port: %s\n", cli, port);
#endif
}

/**
 * @brief Called when a client disconnects to the server.
 *
 * @param client Client connection. The @p client parameter is used
 * in order to send messages and retrieve informations about the
 * client.
 */
void onclose(ws_cli_conn_t *client)
{
	char *cli;
	cli = ws_getaddress(client);
#ifndef DISABLE_VERBOSE
	printf("Connection closed, addr: %s\n", cli);
#endif
}

/**
 * @brief Called when we receive an event from debugger
 */
void debug_event_handler(dbg_event_t type, void *data)
{
	if (type == DBG_STEP)
	{
		ws_sendframe_txt(NULL, regs_as_json());
	}

	if (type == DBG_YM2612)
	{
		char *json = (char *)data;
		ws_sendframe_txt(NULL, json);
	}
}

void send_cram_values()
{
	ws_sendframe_txt(NULL, read_memory_as_json(0, 32 * 4, "cram"));
}

/**
 * @brief Called when a client connects to the server.
 *
 * @param client Client connection. The @p client parameter is used
 * in order to send messages and retrieve informations about the
 * client.
 *
 * @param msg Received message, this message can be a text
 * or binary message.
 *
 * @param size Message size (in bytes).
 *
 * @param type Message type.
 */
void onmessage(ws_cli_conn_t *client,
			   const unsigned char *msg, uint64_t size, int type)
{
	char *cli;
	cli = ws_getaddress(client);
#ifndef DISABLE_VERBOSE
	printf("I receive a message: %s (size: %" PRId64 ", type: %d), from: %s\n",
		   msg, size, type, cli);
#endif

	char *message = NULL;

	if (strcmp((const char *)msg, "regs") == 0)
	{
		message = regs_as_json();
	}

	// Format: "regs set <reg> <value>"
	if (strstr((const char *)msg, "regs set") == (const char *)msg)
	{
		strtok((char *)msg, " ");
		strtok(NULL, " "); // Skip "set"

		m68k_register_t reg = read_number_token();
		uint32_t value = read_number_token();

		m68k_set_reg(reg, value);
	}

	// Format: "asm <address> <index> <size>"
	// Pass either <address> or <index>
	// <address> is used when retrieving by PC
	// <index> is used when free scrolling
	if (strstr((const char *)msg, "asm") == (const char *)msg)
	{
		strtok((char *)msg, " ");

		uint32_t address = read_number_token();
		uint32_t index = read_number_token();
		uint16_t size = atoi(strtok(NULL, " "));
		int rc = disasm_as_json(index, address, size, &message);
		if (rc == STORAGE_INSTRUCTION_MISSING)
		{
			extract_functions(0, address, read_memory);
			disasm_as_json(index, address, size, &message);
		}
	}

	if (strcmp((const char *)msg, "step") == 0)
	{
		dbg_trace = 1;
		pause_emu = 0;
	}

	if (strcmp((const char *)msg, "run") == 0)
	{
		pause_emu = 0;
	}

	if (strcmp((const char *)msg, "reset") == 0)
	{
		system_reset();
		message = regs_as_json();
	}

	if (strcmp((const char *)msg, "funcs") == 0)
	{
		message = funcs();
	}

	if (strcmp((const char *)msg, "enable break_in_interrupts") == 0)
	{
		break_in_interrupt = 1;
	}

	if (strcmp((const char *)msg, "disable break_in_interrupts") == 0)
	{
		break_in_interrupt = 0;
	}

	// Format: "mem <address> <size> (<type: "vram" | "cram">)"
	if (strstr((const char *)msg, "mem ") == (const char *)msg)
	{
		strtok((char *)msg, " ");

		uint32_t address = read_number_token();
		uint16_t size = atoi(strtok(NULL, " "));
		char *type = strtok(NULL, " ");
		message = read_memory_as_json(address, size, type);
		printf("reading addr: %u, with size: %d, val: %s\n", address, size, message);
	}

	// Format: "memw <address> <value>"
	if (strstr((const char *)msg, "memw ") == (const char *)msg)
	{
		strtok((char *)msg, " ");

		uint32_t address = read_number_token();
		uint16_t value = read_number_token();
		write_memory_byte(address, value);
	}

	// Format: "bpt add <address> <type> (<condition: "value_equal">)"
	if (strstr((const char *)msg, "bpt add ") == (const char *)msg)
	{
		strtok((char *)msg, " ");
		strtok(NULL, " "); // Skip "add"

		uint32_t address = read_number_token();
		uint16_t type = read_number_token();

		char *condition_provided = strtok(NULL, " ");
		uint32_t value_equal_num;
		if (condition_provided != NULL)
		{
			value_equal_num = strtol(condition_provided, NULL, 0);
		}

		add_bpt(type, address, 1, condition_provided != NULL, value_equal_num);
	}

	// Format: "bpt clear_all"
	if (strcmp((const char *)msg, "bpt clear_all") == 0)
	{
		clear_bpt_list();
	}

	// Format: "fn name <address> <name>"
	if (strstr((const char *)msg, "fn name ") == (const char *)msg)
	{
		strtok((char *)msg, " ");
		strtok(NULL, " "); // Skip "name"

		uint32_t address = read_number_token();
		char *name = strtok(NULL, " ");

		create_label(address, name);
	}

	// Format: "add comment <address> comment"
	if (strstr((const char *)msg, "add comment ") == (const char *)msg)
	{
		strtok((char *)msg, " ");
		strtok(NULL, " "); // Skip "comment"

		uint32_t address = read_number_token();
		char *comment = strtok(NULL, "");

		add_comment(address, comment);
	}

	if (message != NULL)
	{
		ws_sendframe_txt(client, message);
		free(message);
	}
}

/**
 * Reads next token in space separated line. Convert it to number.
 * Supports hexadecimal values prepended by 0x.
 */
uint32_t read_number_token()
{
	uint32_t address;
	char *address_string = strtok(NULL, " ");
	if (strstr(address_string, "0x") == address_string)
	{
		address = (int)strtol(address_string, NULL, 0);
	}
	else
	{
		address = atoi(address_string);
	}

	return address;
}

char *regs_as_json()
{
	char comment[200];
	comment[0] = 0;
	simulate_instruction(m68k.pc, m68k.dar, comment, read_memory);

	char *message = malloc(500);
	sprintf(message, "{ \"type\": \"regs\", \"data\": {"
					 "\"pc\": %d, "
					 "\"d0\": %d, "
					 "\"d1\": %d, "
					 "\"d2\": %d, "
					 "\"d3\": %d, "
					 "\"d4\": %d, "
					 "\"d5\": %d, "
					 "\"d6\": %d, "
					 "\"d7\": %d, "
					 "\"a0\": %d, "
					 "\"a1\": %d, "
					 "\"a2\": %d, "
					 "\"a3\": %d, "
					 "\"a4\": %d, "
					 "\"a5\": %d, "
					 "\"a6\": %d, "
					 "\"a7\": %d, "
					 "\"sp\": %d, "
					 "\"sr\": %d, "
					 "\"prev_pc\": %d, "
					 "\"comment\": \"%s\", "
					 "\"ntab\": %d, "	/* Name table A base address */
					 "\"ntbb\": %d, "	/* Name table B base address */
					 "\"satb\": %d "	/* Sprite attribute table base address */
					 "}}",
			m68k.pc,
			m68k.dar[0],
			m68k.dar[1],
			m68k.dar[2],
			m68k.dar[3],
			m68k.dar[4],
			m68k.dar[5],
			m68k.dar[6],
			m68k.dar[7],
			m68k.dar[8], // A0
			m68k.dar[9],
			m68k.dar[10],
			m68k.dar[11],
			m68k.dar[12],
			m68k.dar[13],
			m68k.dar[14],
			m68k.dar[15], // A7
			m68k.dar[15],
			m68k_get_reg(M68K_REG_SR),
			m68k.prev_pc,
			comment,
			ntab,
			ntbb,
			satb);

	return message;
}

// type: 'rom' | 'vram' | 'cram'
char *read_memory_as_json(uint32_t address, uint16_t size, char *type)
{
	// Each byte representation is 3 digits max (e.g. 255) plus 1 byte for comma, plus some extra bytes for template
	char *result = malloc(size * 4 + 100);
	char *template = "{ \"type\": \"mem\", \"mem_type\": \"%s\", \"address\": %u, \"data\": [";
	if (type == NULL)
	{
		type = "rom";
	}
	char *pos = result + sprintf(result, template, type, address);

	for (int block = 0; block < ceil(size / 16.0); block++)
	{
		if (block > 0)
		{
			pos += sprintf(pos, ",");
		}

		pos += sprintf(pos, "[");
		for (uint16_t i = block * 16; i < fmin((block + 1) * 16, size); i++)
		{
			char *lastChar = (i + 1 == fmin((block + 1) * 16, size)) ? "]" : ",";
			pos += sprintf(pos, "%u%s", read_memory_byte(address + i, type), lastChar);
		}
	}
	sprintf(pos, "]}");

	return result;
}

void start_server()
{
	ws_socket(&(struct ws_server){
		/*
		 * Bind host:
		 * localhost -> localhost/127.0.0.1
		 * 0.0.0.0   -> global IPv4
		 * ::        -> global IPv4+IPv6 (DualStack)
		 */
		.host = "127.0.0.1",
		.port = 8080,
		.thread_loop = 1,
		.timeout_ms = 1000,
		.evs.onopen = &onopen,
		.evs.onclose = &onclose,
		.evs.onmessage = &onmessage});

	set_debug_hook(debug_event_handler);
}
