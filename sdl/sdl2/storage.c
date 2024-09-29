#include <string.h>
#include <stdlib.h>

#include <sqlite3.h>
#include "storage.h"
#include <sys/stat.h>

sqlite3 *db;

void init_db(const char *romname)
{
    // Copy romname so we don't trash passed value
    char *filename = malloc(strlen(romname) + 10);
    strcpy(filename, romname);
    // Remove extension
    strtok(filename, ".");
    // Replace it with sqlite extension
    strcat(filename, ".sqlite3");

    struct stat filestat;
    int file_exists = stat(filename, &filestat) == 0;
    char *sql;

    printf("Opening %s\n", filename);

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
        printf("SQL error: %s\n", zErrMsg);
        return r;
        // sqlite3_free(zErrMsg);
    }

    int rowsAffected = sqlite3_changes(db);
    printf("RowsReturned: %d RowsAffected: %d\n", nRow, rowsAffected);

    free(sql_formatted);

    struct SqlResult r = {.aResult = aResult, .nRow = nRow, .nCol = nCol, .zErrMsg = zErrMsg, .rowsAffected = rowsAffected};
    return r;
}

struct SqlResult get_instructions(uint32_t *index, uint32_t address, int as_json, size_t length_around, char **errMsg)
{
    // name is a label.name
    const char *json_select = "SELECT json_group_array (json_object('address', address, 'mnemonic', mnemonic, 'op_str', ifnull(op_1_label_name, op_str), 'op_1', ifnull(op_1_label_address, op_1), 'comment', COMMENT, 'type', type))";
    const char *sql_select = "SELECT address, mnemonic, ifnull(name,op_str) as op_str, op_1, comment";

    const char *body = "FROM (\n\
    SELECT\n\
        row_number() OVER (ORDER BY t.address) AS rowNum,\n\
        l.name AS op_1_label_name,\n\
        l.address AS op_1_label_address,\n\
        *\n\
    FROM (\n\
\n\
    -- Split is a recursive function that splits multiline comments into rows\n\
    WITH RECURSIVE split(address, comment, str, type, lineIdx) AS (\n\
        SELECT address, '', comment || X'0A', 'function_comment' as type, -1 as lineIdx FROM function_comments\n\
    	UNION ALL\n\
        SELECT address, '', comment || X'0A', 'instruction_comment' as type, -1 as lineIdx FROM instruction_comments\n\
        UNION ALL\n\
        SELECT address,\n\
        substr(str, 1, instr(str, X'0A')-1),\n\
        substr(str, instr(str, X'0A')+1),\n\
        type,\n\
        lineIdx + 1\n\
        FROM split WHERE str!='' and instr(str, X'0A') > 0\n\
    )\n\
\n\
    -- Selects function comments\n\
    SELECT\n\
        0 AS id,\n\
        address,\n\
        NULL as mnemonic,\n\
        '' AS op_str,\n\
        0 AS size,\n\
        '' AS op_1,\n\
        'function_comment' as type,\n\
        comment\n\
    FROM split\n\
    WHERE type = 'function_comment'\n\
    UNION ALL\n\
    -- Selects all function labels\n\
    SELECT\n\
        0 AS id,\n\
        start_address AS address,\n\
        ifnull(l.name, 'FUN_' || printf ('%08X', start_address)) AS mnemonic,\n\
        '' AS op_str,\n\
        0 AS size,\n\
        '' AS op_1,\n\
        'label' as type,\n\
        '' as comment \n\
    FROM functions f\n\
        LEFT JOIN labels l ON printf('%X', f.start_address) = l.address\n\
    UNION ALL\n\
\n\
    -- Selects all local branch labels\n\
    SELECT \n\
        0 AS id, \n\
        jt.function_start_address as 'address', \n\
        ifnull(l.name, 'LAB_' || printf ('%08X', jt.function_start_address)) AS mnemonic,\n\
        0 AS size,\n\
        '' AS op_1,\n\
        name, \n\
        'label' AS type,\n\
        '' AS comment\n\
    FROM jump_tables jt\n\
        LEFT JOIN labels l ON printf('%X', jt.function_start_address) = l.address\n\
        LEFT JOIN functions f ON f.start_address = jt.function_start_address\n\
        WHERE jt.type = 'local_branch'\n\
        -- Exclude local branch labels that are also function labels\n\
        AND f.id IS NULL\n\
    GROUP BY jt.function_start_address\n\
    UNION ALL\n\
\n\
    -- Selects all instructions\n\
    SELECT\n\
        i.id,\n\
        i.address,\n\
        mnemonic,\n\
        op_str,\n\
        size,\n\
        op_1,\n\
        '' as type,\n\
        ic.comment\n\
    FROM\n\
        instructions i\n\
        LEFT JOIN instruction_comments ic ON ic.address = i.address\n\
    UNION ALL\n\
\n\
    -- Selects all multiline instruction comments, skips first line as it's on the same line as instruction \n\
    SELECT\n\
        0 AS id,\n\
        address,\n\
        NULL as mnemonic,\n\
        '' AS op_str,\n\
        0 AS size,\n\
        '' AS op_1,\n\
        'comment' as type,\n\
        comment\n\
    FROM split\n\
    WHERE type = 'instruction_comment' AND lineIdx > 0) t\n\
    LEFT JOIN labels l ON replace(replace(replace(upper(t.op_str), '$', ''), '.L', ''), '(PC)', '') = l.address) x\n";

    if (address)
    {
        struct SqlResult rowNum = run_sql("SELECT rowNum %s WHERE address = 0x%X and type = ''", body, address);
        if (rowNum.nRow == 0)
        {
            *errMsg = "Address not found";
            return rowNum;
        }
        *index = atoi(rowNum.aResult[1]);
        sqlite3_free_table(rowNum.aResult);
    }

    return run_sql("%s %s WHERE\
    x.rowNum >= %d - %d\
    AND x.rowNum <= %d + %d", as_json ? json_select : sql_select, body, *index, length_around, *index, length_around);
}

int disasm_as_json(uint32_t index, uint32_t address, size_t length, char **jsonOut)
{
    struct SqlResult count = run_sql("select count(*) from instructions");

    char *errMsg = (char*)-1;
    struct SqlResult result = get_instructions(&index, address, 1, 100, &errMsg);
    if (errMsg != (char*)-1) {
        *jsonOut = malloc(strlen(errMsg) + 100);
        sprintf(*jsonOut, "{ \"type\": \"asm\", \"error\": \"%s\" }", errMsg);
        return STORAGE_INSTRUCTION_MISSING;
    }

    *jsonOut = malloc(strlen(result.aResult[1]) + 100);

    sprintf(*jsonOut, "{ \"type\": \"asm\", \"index\": %u, \"count\": %s, \"data\": %s }", index >= 100 ? index - 100 : 0, count.aResult[1], result.aResult[1]);

    sqlite3_free_table(result.aResult);
    sqlite3_free_table(count.aResult);
}

struct fam *fam_new(size_t size)
{
    struct fam *fam1 = malloc(sizeof(struct fam));
    fam1->len = size;
    fam1->arr = malloc(sizeof(int) * size);

    return fam1;
}

void fam_append(struct fam *fam1, int value)
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

struct fam *get_functions(void)
{
    struct SqlResult result = run_sql("select start_address from functions");

    struct fam *fam1 = fam_new(result.nRow);

    for (size_t i = 1; i <= result.nRow; i++)
    {
        fam1->arr[i - 1] = atoi(result.aResult[i]);
    }

    sqlite3_free_table(result.aResult);

    return fam1;
}

char *funcs(void)
{
    struct SqlResult result = run_sql("SELECT json_group_array(json_object('start_address', start_address, 'end_address', end_address, 'name', t.name, 'references', json(t.refs), 'comment', t.comment)) from \n\
    (SELECT \n\
    f.*, \n\
    NULLIF(json_group_array (( \n\
            -- Find a function that surrounds referenced instruction \n\
            SELECT \n\
                json_object('address', printf ('%%X', jt.instruction_address), 'func_address', printf ('%%X', start_address), 'func', ref_label.name) \n\
                FROM functions ref_f \n\
            -- Get a label for referenced function \n\
            LEFT JOIN labels ref_label ON ref_label.address = printf ('%%X', ref_f.start_address) \n\
        WHERE \n\
            jt.instruction_address BETWEEN start_address \n\
            AND end_address \n\
        ORDER BY \n\
            start_address DESC \n\
        LIMIT 1)), '[null]') AS refs, \n\
    l.name, \n\
    fc.comment \n\
FROM \n\
    functions f \n\
    LEFT JOIN jump_tables jt ON jt.function_start_address = f.start_address \n\
    LEFT JOIN labels l ON l.address = printf ('%%X', f.start_address) \n\
    LEFT JOIN function_comments fc ON fc.address = f.start_address \n\
GROUP BY \n\
    f.start_address \n\
ORDER BY \n\
    f.start_address) t");

    return result.aResult[1];
}

void create_label(uint32_t address, char *name)
{
    if (name == NULL) 
    {
        run_sql("DELETE FROM labels WHERE address = '%X'", address);
    } 
    else 
    {
        run_sql("INSERT OR REPLACE INTO labels (address, name) VALUES ('%X', '%s')", address, name);
    }
}

void create_system_label(uint32_t address, char *name)
{
    run_sql("INSERT OR REPLACE INTO labels (address, name, source) VALUES ('%X', '%s', 'system')", address, name);
}

struct SqlResult add_comment(uint32_t address, char *comment)
{
    if (comment == NULL)
    {
        return run_sql("DELETE FROM instruction_comments WHERE address = '%d'", address);
    }
    else
    {
        return run_sql("INSERT OR REPLACE INTO instruction_comments (address, comment) VALUES ('%d', '%s')", address, comment);
    }
}

struct SqlResult add_function_comment(uint32_t address, char *comment)
{
    if (comment == NULL)
    {
        return run_sql("DELETE FROM function_comments WHERE address = '%d'", address);
    }
    else
    {
        return run_sql("INSERT OR REPLACE INTO function_comments (address, comment) VALUES ('%d', '%s')", address, comment);
    }
}
