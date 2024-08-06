#include <string.h>
#include <stdlib.h>

#include <sqlite3.h>
#include "storage.h"
#include <sys/stat.h>

sqlite3 *db;

void init_db(const char *romname)
{
    // Copy romname so we don't trash passed value
    char *filename = malloc(strlen(romname));
    strcpy(filename, romname);
    // Remove extension
    strtok(filename, ".");
    // Replace it with sqlite extension
    strcat(filename, ".sqlite3");

    struct stat filestat;
    int file_exists = stat(filename, &filestat) == 0;
    char *sql;

    if (!file_exists)
    {
        stat("./sdl2/structure.sql", &filestat);
        FILE *f = fopen("./sdl2/structure.sql", "r");
        sql = malloc(filestat.st_size);
        fread(sql, filestat.st_size, 1, f);
        fclose(f);
    }

    int rc = sqlite3_open(filename, &db);
    if (rc != SQLITE_OK)
    {
        printf("failed to open the db\n");
        exit(1);
    }

    // Create structure for new database
    if (!file_exists)
    {
        run_sql(sql);
    }
}

struct SqlResult run_sql(const char *sql, ...)
{
    if (db == NULL)
    {
        printf("db must be initialzed\n");
        exit(1);
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
    char *zErrMsg = 0;
    int rc = sqlite3_get_table(db, sql_formatted, &aResult, &nRow, &nCol, &zErrMsg);
    if (rc != SQLITE_OK)
    {
        struct SqlResult r = {.zErrMsg = zErrMsg};
        return r;
        // printf("SQL error: %s\n", zErrMsg);
        // sqlite3_free(zErrMsg);
    }

    int rowsAffected = sqlite3_changes(db);
    printf("RowsReturned: %d RowsAffected: %d\n", nRow, rowsAffected);

    free(sql_formatted);

    struct SqlResult r = {.aResult = aResult, .nRow = nRow, .nCol = nCol, .zErrMsg = zErrMsg, .rowsAffected = rowsAffected};
    return r;
}

struct SqlResult get_instructions(uint32_t index, int as_json, size_t length_around)
{
    const char *json_select = "SELECT json_group_array (json_object('address', t.address, 'mnemonic', mnemonic, 'op_str', ifnull(l.name,op_str), 'op_1', op_1, 'comment', ic.comment ))";
    const char *sql_select = "SELECT t.address, mnemonic, ifnull(l.name,op_str) as op_str, op_1, ic.comment";

    return run_sql("%s\
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
        LEFT JOIN instruction_comments ic ON ic.address = t.address\
    where t.rowNum >= %d - %d and t.rowNum <= %d + %d\n",
                   as_json ? json_select : sql_select,
                   index, length_around, index, length_around);
}

void disasm_as_json(uint32_t index, uint32_t address, size_t length, char **message)
{
    struct SqlResult count = run_sql("select count(*) from instructions");

    if (address)
    {
        struct SqlResult rowNum = run_sql("select rowNum from (SELECT address, row_number() OVER (ORDER BY address) AS rowNum FROM instructions) t where t.address >= %d LIMIT 1", address);
        index = atoi(rowNum.aResult[1]);
        sqlite3_free_table(rowNum.aResult);
    }

    struct SqlResult result = get_instructions(index, 1, 100);

    *message = malloc(strlen(result.aResult[1]) + 100);

    sprintf(*message, "{ \"type\": \"asm\", \"index\": %u, \"count\": %s, \"data\": %s }", index >= 100 ? index - 100 : 0, count.aResult[1], result.aResult[1]);

    sqlite3_free_table(result.aResult);
    sqlite3_free_table(count.aResult);
}

fam *fam_new(size_t size)
{
    fam *fam1 = malloc(sizeof(fam));
    fam1->len = size;
    fam1->arr = malloc(sizeof(uint64_t) * size);

    return fam1;
}

void fam_append(fam *fam1, int value)
{
    fam1->len++;
    fam1->arr = realloc(fam1->arr, fam1->len * sizeof(int));
    if (fam1->arr == NULL)
    {
        printf("failed to realloc fam1");
        exit(-1);
    }

    fam1->arr[fam1->len - 1] = value;
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
    struct SqlResult result = run_sql("SELECT json_group_array(json_object('start_address', start_address, 'end_address', end_address, 'name', t.name, 'references', json(t.refs))) from \
    (SELECT \
        f.*, \
        NULLIF(json_group_array (json_object('address', printf ('%%X', jt.instruction_address), 'func', ref_label.name, 'func_address', ref_f.start_address)), '[{\"address\":\"0\",\"func\":null,\"func_address\":null}]') AS refs, \
        l.name \
    from functions f \
    LEFT JOIN jump_tables jt ON jt.function_start_address = f.start_address \
    LEFT JOIN labels l ON l.address = printf ('%%X', f.start_address) \n\
    -- Find a function that surrounds referenced instruction \n\
    LEFT JOIN functions ref_f ON jt.instruction_address BETWEEN ref_f.start_address \
		AND ref_f.end_address \n\
    -- Get a label for referenced function \n\
    LEFT JOIN labels ref_label ON ref_label.address = printf ('%%X', ref_f.start_address) \
    GROUP BY f.start_address \
    ORDER BY f.start_address) t");
    return result.aResult[1];
}

void create_label(uint32_t address, char *name)
{
    run_sql("INSERT OR REPLACE INTO labels (address, name) VALUES ('%X', '%s')", address, name);
}

struct SqlResult add_comment(uint32_t address, char *comment)
{
    if (comment == NULL)
    {
        return run_sql("DELETE FROM instruction_comments WHERE address = '%d'", address);
    }
    else
    {
        return run_sql("INSERT INTO instruction_comments (address, comment) VALUES ('%d', '%s')", address, comment);
    }
}
