
#ifndef _STORAGE_H_
#define _STORAGE_H_

// Has uint32_t
#include <stdint.h>
// Has size_t
#include <stdio.h>

#define STORAGE_INSTRUCTION_MISSING 1 // Instruction not found in the database

void init_db(const char *filename);
int disasm_as_json(uint32_t index, uint32_t address, size_t length, char **jsonOut);
char *funcs(void);

struct fam { 
    uint16_t len; 
    uint32_t* arr; 
}; 
struct fam *fam_new(size_t size);
void fam_append(struct fam *fam1, int value);
struct fam *get_functions(void);
void create_label(uint32_t address, char *name);
void create_system_label(uint32_t address, char *name);
struct SqlResult add_comment(uint32_t address, char *comment);
struct SqlResult get_instructions(uint32_t *index, uint32_t address, int as_json, size_t length_around, char **errMsg);

struct SqlResult run_sql(const char *sql, ...);

struct SqlResult
{
    char **aResult;
    int nRow;
    int nCol;
    char *zErrMsg;
    int rowsAffected;
};

#endif /* _STORAGE_H_ */
