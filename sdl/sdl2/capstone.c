#include <stdio.h>
#include <string.h>

#include <capstone/capstone.h>
#include "debug.h"
#include <sqlite3.h>

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

int disasm_as_json_x(const uint8_t *code, uint32_t address, size_t length, char **message)
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

int first_index = 0;
static int sql_callback(void *p, int argc, char **argv, char **azColName)
{ 
    char *lastChar = ",";
    char **message = p;

    if (!first_index) {
        first_index = atoi(argv[1]);
    }

    sprintf(*message + strlen(*message), "{ "
                                         "\"address\": %s,"
                                         "\"mnemonic\": \"%s\","
                                         "\"op_str\": \"%s\" }%s\n",
            argv[2], argv[3], argv[4], lastChar);

    return 0;
}

sqlite3 *db;
char *zErrMsg = 0;

void run_sql(char **message, const char *sql, ...)
{
    va_list arg;
    va_start(arg, sql);
    size_t needed = vsnprintf(NULL, 0, sql, arg);
    char *sql_formatted = malloc(needed+1);
    vsprintf(sql_formatted, sql, arg);
    va_end(arg);

    printf(sql_formatted);

    int rc = sqlite3_exec(db, sql_formatted, sql_callback, message, &zErrMsg);
    if (rc != SQLITE_OK)
    {
        fprintf(stderr, "SQL error: %s\n", zErrMsg);
        sqlite3_free(zErrMsg);
    }
}

int disasm_as_json(const uint8_t *code, uint32_t address, size_t length, char **message)
{
    if (db == NULL)
    {
        int rc = sqlite3_open("Dune - The Battle for Arrakis (U) [!].sqlite3", &db);
        if (rc != SQLITE_OK)
        {
            printf("failed to open the db\n");
            exit(1);
        }
    }

    *message = malloc(15000);
    sprintf(*message, "{ \"type\": \"asm\", \"data\": [\n");

    first_index = 0;
    run_sql(message, "WITH const as (select rowNum from (SELECT address, row_number() OVER (ORDER BY address) AS rowNum FROM instructions) t where t.address = %d)\
    SELECT * FROM\
    (SELECT\
	    id,\
	    row_number() OVER (ORDER BY address) AS rowNum,\
	    address,\
	    mnemonic,\
	    op_str,\
	    size\
    FROM\
	    instructions) t, const\
    where t.rowNum >= const.rowNum - 100 and t.rowNum < const.rowNum + 100\n", address);

    sprintf(*message + strlen(*message) - 2, "], \"index\": %d }", first_index);
}