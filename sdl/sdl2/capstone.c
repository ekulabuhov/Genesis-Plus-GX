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

    printf("%s\n", sql_formatted);

    char **aResult;
    int nRow = 0, nCol = 0;
    int rc = sqlite3_get_table(db, sql_formatted, &aResult, &nRow, &nCol, &zErrMsg);
    if (rc != SQLITE_OK)
    {
        printf("SQL error: %s\n", zErrMsg);
        sqlite3_free(zErrMsg);
    }

    free(sql_formatted);

    struct SqlResult r = {.aResult = aResult, .nRow = nRow, .nCol = nCol};
    return r;
}

void disasm_as_json(uint32_t index, uint32_t address, size_t length, char **message)
{
    struct SqlResult count = run_sql("select count(*) from instructions");

    if (address) {
        struct SqlResult rowNum = run_sql("select rowNum from (SELECT address, row_number() OVER (ORDER BY address) AS rowNum FROM instructions) t where t.address >= %d LIMIT 1", address);
        index = atoi(rowNum.aResult[1]);
        sqlite3_free_table(rowNum.aResult);
    }

    struct SqlResult result = run_sql("SELECT json_group_array (json_object('address', t.address, 'mnemonic', mnemonic, 'op_str', ifnull(l.name,op_str), 'op_1', op_1 ))\
        FROM\
    (SELECT\
	    id,\
	    row_number() OVER (ORDER BY address) AS rowNum,\
	    address,\
	    mnemonic,\
	    op_str,\
	    size,\
        op_1\
    FROM\
	    instructions) t\
        LEFT JOIN labels l ON t.op_1 = l.address\
    where t.rowNum >= %d - 100 and t.rowNum < %d + 100\n",
                         index, index);
    

    *message = malloc(strlen(result.aResult[1]) + 100);
    
    sprintf(*message, "{ \"type\": \"asm\", \"index\": %u, \"count\": %s, \"data\": %s }", index > 100 ? index - 100 : 1, count.aResult[1], result.aResult[1]);

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
    struct SqlResult result = run_sql("select json_group_array(json_object('start_address', start_address, 'end_address', end_address, 'name', t.name, 'references', json(t.refs))) from \
    (select f.*, NULLIF(json_group_array(printf('%%X', i.address)), '[\"0\"]') as refs, l.name\
    from functions f\
    left join instructions i on \
        i.op_1 = printf('%%X', f.start_address)\
        and mnemonic = 'jsr'\
    LEFT JOIN labels l on i.op_1 = l.address\
    group by f.start_address\
    ORDER BY f.start_address) t");
    return result.aResult[1];
}

void create_label(uint32_t address, char *name) {
    run_sql("INSERT OR REPLACE INTO labels (address, name) VALUES ('%X', '%s')", address, name);
}