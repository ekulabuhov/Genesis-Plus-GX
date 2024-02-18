#include <stdlib.h>
#include <stdio.h>
#include <capstone/capstone.h>
#include <string.h>
#include <sqlite3.h>

struct Tuple {
    int bra_destination;
    int last_address;
    int return_address;
};

struct FromTo {
    int from;
    int to;
};

struct Function {
    int start_address;
    int end_address;
    struct FromTo *functions;
    int function_count;
    int function_size;
};

struct FromTo *visited_branches = NULL;
int visited_branches_count;
int visited_branches_size = 0;

static int sql_callback(void *NotUsed, int argc, char **argv, char **azColName) {
    int i;
    for (i = 0; i < argc; i++) {
        printf("%s = %s\n", azColName[i], argv[i] ? argv[i] : "NULL");
    }
    printf("\n");
    return 0;
}

sqlite3 *db;
char *zErrMsg = 0;

void run_sql(const char *sql, ...) {
    char *sql_formatted = malloc(100);

    va_list arg;
    va_start(arg, sql);
    vsprintf(sql_formatted, sql, arg);
    va_end(arg);

    int rc = sqlite3_exec(db, sql_formatted, sql_callback, 0, &zErrMsg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "SQL error: %s\n", zErrMsg);
        sqlite3_free(zErrMsg);
    }
}

void add_function(struct Function *f, int from, int to) {
    if (f->function_size == f->function_count) {
        f->function_size += 20;
        int new_size = sizeof(struct FromTo) * (f->function_size);
        f->functions = realloc(f->functions, new_size);
        if (f->functions == NULL) {
            printf("failed to realloc functions");
            exit(-1);
        }
    }

    struct FromTo *x = &f->functions[f->function_count++];
    x->from = from;
    x->to = to;
}

struct Tuple find_rts(int length, int address, const unsigned char *code, csh handle, struct Function *f) {
    cs_insn *insn;
    int count = cs_disasm(handle, code, length, address, 0, &insn);
    printf("count: %d, code: %d\n", count, sizeof(code));

    struct Tuple r = {.return_address = 0};
    cs_insn last_instruction = insn[count - 1];
    r.last_address = last_instruction.address + last_instruction.size;

    bool fully_decoded = (r.last_address + 4) >= address + length;
    if (fully_decoded) {
        // Discard last instruction as it might be incomplete
        count--;
    }

    for (int i = 0; i < count; i++) {
        char *bytesAsString = malloc(20);
//        int charsWritten = 0;
//        for (size_t j = 0; j < insn[i].size; j++)
//        {
//            charsWritten += sprintf(bytesAsString + charsWritten, "%02X ", insn[i].bytes[j]);
//        }
//        bytesAsString[charsWritten - 1] = 0;

        printf("%02X: %s\t%s, %s\n", insn[i].address, bytesAsString, insn[i].mnemonic, insn[i].op_str);
        if (fully_decoded || i < (count - 1)) {
            run_sql("INSERT INTO  \"instructions\" (\"address\", \"mnemonic\", \"op_str\", size) VALUES ('%d', '%s', '%s', '%d');",
                    insn[i].address, insn[i].mnemonic, insn[i].op_str, insn[i].size);
        }


        if (strstr(insn[i].mnemonic, "dbra") == insn[i].mnemonic) {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[1].br_disp.disp + 2;
            printf("dbra detected at %02X, jumps to %02X\n", insn[i].address, jump_to);
        }

        if (strstr(insn[i].mnemonic, "bra") == insn[i].mnemonic) {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[0].br_disp.disp + 2;
            printf("bra detected at %02X, jumps to %02X\n", insn[i].address, jump_to);

            if (jump_to > r.last_address && (jump_to < r.bra_destination || r.bra_destination == 0)) {
                r.bra_destination = jump_to;
            }
        }

        if (strstr(insn[i].mnemonic, "bsr") == insn[i].mnemonic) {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[0].br_disp.disp + 2;
            printf("bsr detected at %02X, jumps to %02X\n", insn[i].address, jump_to);

            add_function(f, insn[i].address, jump_to);
        }

        if (strstr(insn[i].mnemonic, "rts") == insn[i].mnemonic) {
            printf("rts detected at %02X\n", insn[i].address);
            r.return_address = insn[i].address;

            return r;
        }

        if (strstr(insn[i].mnemonic, "jmp") == insn[i].mnemonic) {
            int jump_to = 0;
            switch (insn[i].detail->m68k.operands[0].address_mode) {
                case M68K_AM_ABSOLUTE_DATA_LONG:
                case M68K_AM_ABSOLUTE_DATA_SHORT:
                    jump_to = insn[i].detail->m68k.operands[0].imm;
                    break;
                case M68K_AM_PCI_DISP:
                    jump_to = insn[i].address + insn[i].detail->m68k.operands[0].mem.disp + 2;
                    break;
                case M68K_AM_PCI_INDEX_8_BIT_DISP:
                    // Probable jump table ($20f82)
                    if (strstr(insn[i - 4].mnemonic, "cmpi") == insn[i - 4].mnemonic) {
                        // Jump table is zero based, hence +1
                        int jump_table_size = insn[i - 4].detail->m68k.operands[0].imm + 1;
                        // Every entry in jump table is a word (2 bytes)
                        r.last_address = insn[i].address + insn[i].size + jump_table_size * 2;
                        printf("jmp detected at %02X with jump table from %02X to %02X\n", insn[i].address,
                               insn[i].address + insn[i].size, insn[i].address + insn[i].size + jump_table_size * 2);
                        // Return to continue at bra_destination
                        return r;
                    }
                    break;
                default:
                    // Skip jumps that are only known at run-time
                    // e.g. JSR (A0)
                    printf("unhandled jmp\n");
            }

            printf("jmp detected at %02X to %02X\n", insn[i].address, jump_to);
            r.return_address = insn[i].address;

            if (!jump_to) {
                continue;
            }

            add_function(f, insn[i].address, jump_to);

            // This is the last instruction in this function
            return r;
        }

        if (strstr(insn[i].mnemonic, "jsr") == insn[i].mnemonic) {
            int jump_to = 0;
            switch (insn[i].detail->m68k.operands[0].address_mode) {
                case M68K_AM_ABSOLUTE_DATA_LONG:
                case M68K_AM_ABSOLUTE_DATA_SHORT:
                    jump_to = insn[i].detail->m68k.operands[0].imm;
                    break;
                case M68K_AM_PCI_DISP:
                    jump_to = insn[i].address + insn[i].detail->m68k.operands[0].mem.disp + 2;
                    break;
                default:
                    // Skip jumps that are only known at run-time
                    // e.g. JSR (A0)
                    printf("unhandled jsr\n");
            }

            printf("jsr detected at %02X to %02X\n", insn[i].address, jump_to);

            if (!jump_to) {
                continue;
            }

            add_function(f, insn[i].address, jump_to);
        }
    }

    // If we reached here - there was no rts or jmp to end the function
    // We need to continue either with next instruction if we decoded all bytes
    // Or closest label if data was encountered
    if (fully_decoded) {
        // We'll restart from last instruction as it might be only partially decoded
        r.last_address = insn[count - 1].address;
    } else {
        r.last_address = r.bra_destination;
    }

    return r;
}

void add_visited_branch(struct FromTo branch) {
    if (visited_branches_count == visited_branches_size) {
        visited_branches_size += 20;
        int new_size = sizeof(struct FromTo) * (visited_branches_size);
        visited_branches = realloc(visited_branches, new_size);
        if (visited_branches == NULL) {
            printf("failed to realloc");
            exit(-1);
        }
    }

    struct FromTo *x = &visited_branches[visited_branches_count++];
    x->to = branch.to;
    x->from = branch.from;
}


struct Function extract_function(FILE *pFile, int length, int address, unsigned char *code, csh handle) {
    struct Function f = {.start_address = address, .function_count = 0, .function_size = 0, .functions = NULL};
    struct Tuple r;
    do {
        printf("reading %d bytes at %02X\n", length, address);
        if (fseek(pFile, address, SEEK_SET) != 0) {
            printf("failed to seek");
        }

        int result = fread(code, 1, length, pFile);
        printf("read %d bytes\n", result);

        r = find_rts(length, address, code, handle, &f);
        printf("found la %02X, bd %02X\n", r.last_address, r.bra_destination);
        address = r.last_address;
    } while (r.return_address == 0);

    f.end_address = r.return_address;
    return f;
}

void dump_visited_branches() {
    printf("[");
    for (int j = 0; j < visited_branches_count; j++) {
        printf("'%02X', ", visited_branches[j].to);
    }
    printf("]\n");
}

void extract_functions(FILE *pFile, int length, int address, unsigned char *code, csh handle) {
    struct Function f = extract_function(pFile, length, address, code, handle);
    printf("found function %02X to %02X with %d branches\n", f.start_address, f.end_address, f.function_count);
    run_sql("INSERT INTO  \"functions\" (\"start_address\", \"end_address\") VALUES ('%d', '%d')", f.start_address,
            f.end_address);
    for (int i = 0; i < f.function_count; i++) {
        printf("found branching function from %02X to %02X\n", f.functions[i].from, f.functions[i].to);

        bool branch_visited = false;
        for (int j = 0; j < visited_branches_count; j++) {
            if (visited_branches[j].to == f.functions[i].to) {
                branch_visited = true;
                printf("branch already visited from %02X, skipping\n", visited_branches[j].from);
                break;
            }
        }

        if (branch_visited) {
            continue;
        } else {
            add_visited_branch(f.functions[i]);
        }

        if (visited_branches_count % 50 == 0) {
            dump_visited_branches();
        }

        extract_functions(pFile, length, f.functions[i].to, code, handle);
    }
}

// Call this to populate database with byte placeholders
void populate_data(FILE *pFile, int address, int length) {
    unsigned char *code = malloc(length);
    printf("reading %d bytes at %02X\n", length, address);
    if (fseek(pFile, address, SEEK_SET) != 0) {
        printf("failed to seek");
    }

    int result = fread(code, 1, length, pFile);
    printf("read %d bytes\n", result);

    for (int i = 0; i < length; i++) {
        run_sql("INSERT INTO  \"instructions\" (\"address\", \"mnemonic\", \"op_str\") VALUES ('%d', '%s', '%02X');",
                i, "dc.b", code[i]);
    }

}

int main(int argc, char **argv) {
    int rc = sqlite3_open("Dune - The Battle for Arrakis (U) [!].sqlite3", &db);
    if (rc != SQLITE_OK) {
        printf("failed to open the db\n");
        exit(1);
    }

    printf("db connected\n");
    run_sql("DELETE FROM \"instructions\";");
    run_sql("DELETE FROM \"functions\";");

    FILE *pFile = fopen("Dune - The Battle for Arrakis (U) [!].gen", "rb");
    if (pFile == NULL) {
        fputs("File error", stderr);
        exit(1);
    }

    int length = 0x100;
    int address = 0x200;
    unsigned char *code = malloc(length);

    csh handle;

    if (cs_open(CS_ARCH_M68K, CS_MODE_M68K_000, &handle) != CS_ERR_OK)
        return -1;

    if (cs_option(handle, CS_OPT_DETAIL, CS_OPT_ON) != CS_ERR_OK)
        return -1;

    // Entrypoint can be found in the header at 0x4
    struct FromTo start = {.to = 0x200, .from = 0};
    add_visited_branch(start);
    extract_functions(pFile, length, address, code, handle);

    sqlite3_close(db);
    return 0;
}
