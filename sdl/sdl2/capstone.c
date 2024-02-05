#include <stdio.h>
#include <string.h>

#include <capstone/capstone.h>
#include "debug.h"

int disasm_as_json(const uint8_t *code, uint32_t address, size_t length, char **message);
void disasm_rom_as_json(uint32_t address, uint16_t length, char **jsonOut);

#ifdef TEST_MAIN
int main()
{
    char *message;
    disasm_rom_as_json(&message);
    printf(message);
    return 0;
}
#endif

void disasm_rom_as_json(uint32_t address, uint16_t length, char **jsonOut)
{
    unsigned char *romBytes = read_memory(address, length);
    disasm_as_json(romBytes, address, length, jsonOut);
}

int disasm_as_json(const uint8_t *code, uint32_t address, size_t length, char **message)
{
    csh handle;
    cs_insn *insn;
    size_t count;

    *message = malloc(15000);
    sprintf(*message, "{ \"type\": \"asm\", \"data\": [\n");

    if (cs_open(CS_ARCH_M68K, CS_MODE_M68K_000, &handle) != CS_ERR_OK)
        return -1;

    if (cs_option(handle, CS_OPT_DETAIL, CS_OPT_ON) != CS_ERR_OK)
        return -1;

    count = cs_disasm(handle, code, length, address, 0, &insn);
    if (count > 0)
    {
        printf("count: %d, code: %d\n", count, sizeof(code));
        size_t j;
        for (j = 0; j < count; j++)
        {
            char *bytesAsString = malloc(20);
            int charsWritten = 0;
            for (size_t i = 0; i < insn[j].size; i++)
            {
                charsWritten += sprintf(bytesAsString + charsWritten, "%02X ", insn[j].bytes[i]);
            }
            bytesAsString[charsWritten - 1] = 0;

            cs_detail *detail = insn[j].detail;
            printf("0x%" PRIx64 ":\t%s\t%s\t\t%s\n", insn[j].address, bytesAsString, insn[j].mnemonic,
                   insn[j].op_str);

            char *lastChar = (j + 1 == count) ? "]}" : ",";

            sprintf(*message + strlen(*message), "{ "
                                                 "\"address\": %u,"
                                                 "\"bytes\": \"%s\","
                                                 "\"mnemonic\": \"%s\","
                                                 "\"op_str\": \"%s\" }%s\n",
                    insn[j].address, bytesAsString, insn[j].mnemonic, insn[j].op_str, lastChar);
        }

        cs_free(insn, count);
    }
    else
        printf("ERROR: Failed to disassemble given code!\n");

    cs_close(&handle);

    return 0;
}
