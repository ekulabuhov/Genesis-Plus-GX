
#ifndef _CAPSTONE_H_
#define _CAPSTONE_H_

void disasm_as_json(uint32_t index, uint32_t address, size_t length, char **jsonOut);
char *funcs(void);

typedef struct { 
    int len; 
    int arr[]; 
} fam;
void fam_append(fam *fam1, int value);
fam *get_functions(void);

struct SqlResult run_sql(const char *sql, ...);

struct SqlResult
{
    char **aResult;
    int nRow;
    int nCol;
};

#endif /* _CAPSTONE_H_ */
