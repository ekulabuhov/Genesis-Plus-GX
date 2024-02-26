#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

#include <sqlite3.h>
#include "capstone.h"

sqlite3 *db;
char *zErrMsg = 0;

struct SqlResult run_sql(const char *sql, ...)
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

    va_list arg;
    va_start(arg, sql);
    size_t needed = vsnprintf(NULL, 0, sql, arg);
    char *sql_formatted = malloc(needed + 1);
    vsprintf(sql_formatted, sql, arg);
    va_end(arg);

    printf("%s", sql_formatted);

    char **aResult;
    int nRow = 0, nCol = 0;
    int rc = sqlite3_get_table(db, sql_formatted, &aResult, &nRow, &nCol, &zErrMsg);
    if (rc != SQLITE_OK)
    {
        printf("SQL error: %s\n", zErrMsg);
        sqlite3_free(zErrMsg);
    }

    struct SqlResult r = {.aResult = aResult, .nRow = nRow, .nCol = nCol};
    return r;
}

void disasm_as_json(uint32_t index, uint32_t address, size_t length, char **message)
{
    struct SqlResult count = run_sql("select count(*) from instructions");
    struct SqlResult result;
    if (address)
    {
        result = run_sql("WITH const as (select rowNum from (SELECT address, row_number() OVER (ORDER BY address) AS rowNum FROM instructions) t where t.address = %d)\
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
    where t.rowNum >= const.rowNum - 100 and t.rowNum < const.rowNum + 100\n",
                         address);
    }
    else if (index)
    {
        result = run_sql("SELECT * FROM\
    (SELECT\
	    id,\
	    row_number() OVER (ORDER BY address) AS rowNum,\
	    address,\
	    mnemonic,\
	    op_str,\
	    size\
    FROM\
	    instructions) t\
    where t.rowNum >= %d - 100 and t.rowNum < %d + 100\n",
                         index, index);
    }

    *message = malloc(15000);
    sprintf(*message, "{ \"type\": \"asm\", \"index\": %s, \"count\": %s, \"data\": [\n", result.aResult[1 * result.nCol + 1], count.aResult[1]);

    for (size_t j = 1; j <= result.nRow; j++)
    {
        char *lastChar = (j == result.nRow) ? "]}" : ",";

        sprintf(*message + strlen(*message), "{ "
                                             "\"address\": %s,"
                                             "\"mnemonic\": \"%s\","
                                             "\"op_str\": \"%s\" }%s\n",
                result.aResult[j * result.nCol + 2], result.aResult[j * result.nCol + 3], result.aResult[j * result.nCol + 4], lastChar);
    }

    sqlite3_free_table(result.aResult);
    sqlite3_free_table(count.aResult);
}

fam *fam_new(size_t size) {
    fam *fam1 = (fam *)malloc(sizeof(fam *) + size * sizeof(int));
    fam1->len = size;

    return fam1;
}

void fam_append(fam *fam1, int value) {
    fam1->len++;
    fam1 = realloc(fam1, sizeof(fam *) + fam1->len * sizeof(int));
    if (fam1 == NULL)
    {
        printf("failed to realloc fam1");
        exit(-1);
    }

    fam1->arr[fam1->len-1] = value;
}

fam *get_functions(void)
{
    struct SqlResult result = run_sql("select start_address from functions");

    fam *fam1 = fam_new(result.nRow); 

    for (size_t i = 1; i <= result.nRow; i++)
    {
        fam1->arr[i - 1] = atoi(result.aResult[i]);
    }

    sqlite3_free_table(result.aResult);

    return fam1;
}

char *funcs(void)
{
    struct SqlResult result = run_sql("select json_group_array(json_object('start_address', start_address, 'end_address', end_address)) from functions");
    return result.aResult[1];
}
