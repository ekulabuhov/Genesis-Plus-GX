#include <stdlib.h>
#include <stdio.h>
#include <capstone/capstone.h>
#include <string.h>
#include <sqlite3.h>
#include <math.h>

#include "storage.h"
#include "rom_analyzer.h"

#define LENGTH 0x100

struct Tuple
{
    int bra_destination;
    int last_address;
    int return_address;
    fam branches;
};

struct FromTo
{
    int from;
    int to;
};

struct Function
{
    int start_address;
    int end_address;
    int referenced_from;
    struct FromTo *functions;
    int function_count;
    int function_size;

    cs_insn **instructions;
    int instruction_count;
};

struct FromTo *visited_branches = NULL;
int visited_branches_count;
int visited_branches_size = 0;

void add_function(struct Function *f, int from, int to)
{
    if (f->function_size == f->function_count)
    {
        f->function_size += 20;
        int new_size = sizeof(struct FromTo) * (f->function_size);
        f->functions = realloc(f->functions, new_size);
        if (f->functions == NULL)
        {
            printf("failed to realloc functions");
            exit(-1);
        }
    }

    struct FromTo *x = &f->functions[f->function_count++];
    x->from = from;
    x->to = to;
}

struct Tuple find_rts(int address, size_t length, const unsigned char *code, csh handle, struct Function *f, struct Tuple r)
{
    cs_insn *insn;
    int count = cs_disasm(handle, code, length, address, 0, &insn);
    printf("count: %d, code: %d\n", count, sizeof(code));

    cs_insn last_instruction = insn[count - 1];
    r.last_address = last_instruction.address + last_instruction.size;

    bool fully_decoded = (r.last_address + 4) >= address + LENGTH;
    if (fully_decoded)
    {
        // Discard last instruction as it might be incomplete
        count--;
    }

    for (int i = 0; i < count; i++)
    {
        f->instruction_count++;
        int new_size = sizeof(f->instructions[0]) * (f->instruction_count);
        f->instructions = realloc(f->instructions, new_size);
        f->instructions[f->instruction_count - 1] = &insn[i];
        //        char *bytesAsString = malloc(20);
        //        int charsWritten = 0;
        //        for (size_t j = 0; j < insn[i].size; j++)
        //        {
        //            charsWritten += sprintf(bytesAsString + charsWritten, "%02X ", insn[i].bytes[j]);
        //        }
        //        bytesAsString[charsWritten - 1] = 0;

        printf("%02X: %s\t, %s\n", insn[i].address, insn[i].mnemonic, insn[i].op_str);

        if (strstr(insn[i].mnemonic, "dbra") == insn[i].mnemonic)
        {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[1].br_disp.disp + 2;
            printf("dbra detected at %02X, jumps to %02X\n", insn[i].address, jump_to);
        }

        if (strstr(insn[i].mnemonic, "bra") == insn[i].mnemonic)
        {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[0].br_disp.disp + 2;
            printf("bra detected at %02X, jumps to %02X\n", insn[i].address, jump_to);

            if (insn[i].address == jump_to)
            {
                printf("infinite loop detected, treating as end of the function\n");
                r.return_address = jump_to;
                return r;
            }

            if (jump_to >= insn[i].address)
            {
                r.last_address = jump_to;
                return r;
            }
        }

        if (strstr(insn[i].mnemonic, "bsr") == insn[i].mnemonic)
        {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[0].br_disp.disp + 2;
            printf("bsr detected at %02X, jumps to %02X\n", insn[i].address, jump_to);

            add_function(f, insn[i].address, jump_to);
        }

        if (strstr(insn[i].mnemonic, "rts") == insn[i].mnemonic)
        {
            printf("rts detected at %02X\n", insn[i].address);
            r.return_address = insn[i].address;

            // This is the last instruction in this function
            return r;
        }

        if (strstr(insn[i].mnemonic, "rte") == insn[i].mnemonic)
        {
            printf("rte detected at %02X\n", insn[i].address);
            r.return_address = insn[i].address;

            // This is the last instruction in this function
            return r;
        }

        if (strstr(insn[i].mnemonic, "illegal") == insn[i].mnemonic)
        {
            printf("illegal detected at %02X\n", insn[i].address);
            r.return_address = insn[i].address;

            return r;
        }

        if (strstr(insn[i].mnemonic, "jmp") == insn[i].mnemonic)
        {
            int jump_to = 0;
            switch (insn[i].detail->m68k.operands[0].address_mode)
            {
            case M68K_AM_ABSOLUTE_DATA_LONG:
            case M68K_AM_ABSOLUTE_DATA_SHORT:
                jump_to = insn[i].detail->m68k.operands[0].imm;
                break;
            case M68K_AM_PCI_DISP:
                jump_to = insn[i].address + insn[i].detail->m68k.operands[0].mem.disp + 2;
                break;
            case M68K_AM_PCI_INDEX_8_BIT_DISP:
                // Probable jump table ($20f82)
                if (strstr(insn[i - 4].mnemonic, "cmpi") == insn[i - 4].mnemonic)
                {
                    // Jump table is zero based, hence +1
                    int jump_table_size = insn[i - 4].detail->m68k.operands[0].imm + 1;
                    // Every entry in jump table is a word (2 bytes)
                    r.last_address = insn[i].address + insn[i].size + jump_table_size * 2;
                    printf("jmp detected at %02X with jump table from %02X to %02X\n", insn[i].address,
                           insn[i].address + insn[i].size, insn[i].address + insn[i].size + jump_table_size * 2);

                    for (size_t j = 0; j < jump_table_size; j++)
                    {
                        int entry_address = insn[i].address + insn[i].size - address + j * 2;
                        int offset = (code[entry_address] << 8) + code[entry_address+1];
                        int jump_to = insn[i].address + insn[i].size + offset;
                        fam_append(&r.branches, jump_to);
                    }

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

            if (!jump_to)
            {
                continue;
            }

            add_function(f, insn[i].address, jump_to);

            // There's a branch after jmp
            if (r.bra_destination > insn[i].address)
            {
                continue;
            }

            // This is the last instruction in this function
            return r;
        }

        if (strstr(insn[i].mnemonic, "jsr") == insn[i].mnemonic)
        {
            int jump_to = 0;
            switch (insn[i].detail->m68k.operands[0].address_mode)
            {
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

            if (!jump_to)
            {
                continue;
            }

            add_function(f, insn[i].address, jump_to);
        }

        // Bcc
        if (insn[i].bytes[0] >= 0x62 && insn[i].bytes[0] <= 0x6F)
        {
            int jump_to = insn[i].address + insn[i].detail->m68k.operands[0].br_disp.disp + 2;
            printf("%s detected at %02X, jumps to %02X\n", insn[i].mnemonic, insn[i].address, jump_to);

            // We are only interested in jumps forward
            if (jump_to > insn[i].address)
            {
                r.bra_destination = jump_to;
            }

            fam_append(&r.branches, jump_to);
        }
    }

    // If we reached here - there was no rts or jmp to end the function
    // We need to continue either with next instruction if we decoded all bytes
    // Or closest label if data was encountered
    if (fully_decoded)
    {
        // We'll restart from last instruction as it might be only partially decoded
        r.last_address = insn[count].address;
    }

    return r;
}

void add_visited_branch(struct FromTo branch)
{
    if (visited_branches_count == visited_branches_size)
    {
        visited_branches_size += 20;
        int new_size = sizeof(struct FromTo) * (visited_branches_size);
        visited_branches = realloc(visited_branches, new_size);
        if (visited_branches == NULL)
        {
            printf("failed to realloc");
            exit(-1);
        }
    }

    struct FromTo *x = &visited_branches[visited_branches_count++];
    x->to = branch.to;
    x->from = branch.from;
}

static FILE *pFile;
unsigned char *code;

unsigned char *read_from_file(unsigned int length, unsigned int address)
{
    printf("reading %d bytes at %02X\n", length, address);
    if (fseek(pFile, address, SEEK_SET) != 0)
    {
        printf("failed to seek");
    }

    int result = fread(code, 1, length, pFile);
    printf("read %d bytes\n", result);

    return code;
}

csh handle;

void print_function(struct Function f)
{
    for (size_t i = 0; i < f.instruction_count; i++)
    {
        printf("%02X: %s\t %s\n", f.instructions[i]->address, f.instructions[i]->mnemonic, f.instructions[i]->op_str);
    }

    printf("%02X - %02X\n", f.start_address, f.end_address);
}

int cmpfunc(const void *a, const void *b)
{
    cs_insn *aa = *(cs_insn **)a;
    cs_insn *bb = *(cs_insn **)b;

    return aa->address - bb->address;
}

struct Function extract_function(int referenced_from, int address, rom_reader read_rom)
{
    struct Function f = {.start_address = address, .referenced_from = referenced_from, .function_count = 0, .function_size = 0, .functions = NULL};

    if (handle == 0)
    {
        if (cs_open(CS_ARCH_M68K, CS_MODE_M68K_000, &handle) != CS_ERR_OK)
            return f;

        if (cs_option(handle, CS_OPT_DETAIL, CS_OPT_ON) != CS_ERR_OK)
            return f;
    }

    struct Tuple r = {.return_address = 0};
    do
    {
        const unsigned char *code = read_rom(LENGTH, address);

        r = find_rts(address, LENGTH, code, handle, &f, r);
        printf("found la %02X, bd %02X\n", r.last_address, r.bra_destination);
        address = r.last_address;
    } while (r.return_address == 0);

    f.end_address = r.return_address;

    // Visit all local branches
    for (size_t i = 0; i < r.branches.len; i++)
    {
        int local_branch = r.branches.arr[i];
        int local_branch_visited = 0;
        for (size_t j = 0; j < f.instruction_count; j++)
        {
            if (f.instructions[j]->address > local_branch)
            {
                break;
            }

            if (f.instructions[j]->address == local_branch)
            {
                local_branch_visited = 1;
                break;
            }
        }

        if (local_branch_visited == 0)
        {
            int next_instruction_address = 0;
            if (local_branch < f.instructions[f.instruction_count - 1]->address)
            {
                for (size_t j = 0; j < f.instruction_count; j++)
                {
                    if (f.instructions[j]->address > local_branch)
                    {
                        next_instruction_address = f.instructions[j]->address;
                        break;
                    }
                }
            }

            r.return_address = 0;

            int waiting_for_rts = 0;
            address = local_branch;
            do
            {
                int length = next_instruction_address ? fmin(LENGTH, next_instruction_address - address) : LENGTH;
                const unsigned char *code = read_rom(length, address);
                r = find_rts(address, length, code, handle, &f, r);
                address = r.last_address;
            } while (next_instruction_address - r.last_address > 0 && r.return_address == 0);

            if (r.return_address > f.end_address) {
                f.end_address = r.return_address;
            }

            qsort(f.instructions, f.instruction_count, sizeof(cs_insn **), cmpfunc);
            print_function(f);
        }
    }

    return f;
}

void dump_visited_branches(void)
{
    printf("[");
    for (int j = 0; j < visited_branches_count; j++)
    {
        printf("'%02X', ", visited_branches[j].to);
    }
    printf("]\n");
}

void store_in_db(struct Function f)
{
    run_sql("INSERT INTO  \"functions\" (\"start_address\", \"end_address\") VALUES ('%d', '%d')\n", f.start_address,
            f.end_address);

    for (size_t i = 0; i < f.instruction_count; i++)
    {
        cs_insn insn = *f.instructions[i];
        char op_1[10];
        sprintf(op_1, "NULL");
        int jump_to = 0;
        if ((strstr(insn.mnemonic, "jsr") == insn.mnemonic) ||
            (strstr(insn.mnemonic, "jmp") == insn.mnemonic))
        {
            switch (insn.detail->m68k.operands[0].address_mode)
            {
            case M68K_AM_ABSOLUTE_DATA_LONG:
            case M68K_AM_ABSOLUTE_DATA_SHORT:
                jump_to = insn.detail->m68k.operands[0].imm;
                break;
            case M68K_AM_PCI_DISP:
                jump_to = insn.address + insn.detail->m68k.operands[0].mem.disp + 2;
                break;
            }

            if (jump_to)
            {
                sprintf(op_1, "'%X'", jump_to);
            }
        }

        run_sql("INSERT INTO  \"instructions\" (\"address\", \"mnemonic\", \"op_str\", size, op_1) VALUES ('%d', '%s', '%s', '%d', %s)\n",
                insn.address, insn.mnemonic, insn.op_str, insn.size, op_1);
    }

    run_sql("INSERT INTO jump_tables (instruction_address, function_start_address)"
            "VALUES ('%d', '%d')",
            f.referenced_from, f.start_address);

    for (size_t i = 0; i < f.function_count; i++)
    {
        run_sql("INSERT INTO jump_tables (instruction_address, function_start_address)"
                "VALUES ('%d', '%d')",
                f.functions[i].from, f.functions[i].to);
    }
}

fam *extracted_functions;

int extract_functions(int referenced_from, int address, rom_reader read_rom)
{
    if (extracted_functions == NULL)
    {
        extracted_functions = get_functions();
        printf("retrieved %d\n", extracted_functions->len);
        for (size_t i = 0; i < extracted_functions->len; i++)
        {
            struct FromTo start = {.to = extracted_functions->arr[i], .from = 0};
            add_visited_branch(start);
        }

        dump_visited_branches();
    }

    struct Function f = extract_function(referenced_from, address, read_rom);
    printf("found function %02X to %02X with %d branches\n", f.start_address, f.end_address, f.function_count);

    store_in_db(f);

    for (int i = 0; i < f.function_count; i++)
    {
        printf("found branching function from %02X to %02X\n", f.functions[i].from, f.functions[i].to);

        bool branch_visited = false;
        for (int j = 0; j < visited_branches_count; j++)
        {
            if (visited_branches[j].to == f.functions[i].to)
            {
                branch_visited = true;
                printf("branch already visited from %02X, skipping\n", visited_branches[j].from);
                break;
            }
        }

        if (branch_visited)
        {
            continue;
        }
        else
        {
            add_visited_branch(f.functions[i]);
        }

        if (visited_branches_count % 50 == 0)
        {
            dump_visited_branches();
        }

        extract_functions(f.functions[i].from, f.functions[i].to, read_rom);
    }

    return 0;
}

uint32_t endian_swap(uint32_t x)
{
    return (x >> 24) |
           ((x << 8) & 0x00FF0000) |
           ((x >> 8) & 0x0000FF00) |
           (x << 24);
}

// Call this to populate database with byte placeholders
void populate_data(FILE *pFile, int address, int length, int size)
{
    unsigned char *code = malloc(length);
    printf("reading %d bytes at %02X\n", length, address);
    if (fseek(pFile, address, SEEK_SET) != 0)
    {
        printf("failed to seek");
    }

    int result = fread(code, 1, length, pFile);
    printf("read %d bytes\n", result);

    char sizeCode = 'b';

    if (size == 2)
    {
        sizeCode = 'w';
    }
    else if (size == 4)
    {
        sizeCode = 'l';
    }

    for (int i = 0; i < length; i += size)
    {
        run_sql("INSERT INTO  \"instructions\" (\"address\", \"mnemonic\", \"op_str\") VALUES ('%d', 'dc.%c', '%02X');",
                i, sizeCode, endian_swap(*((uint32_t *)code + (i / size))));
    }
}

static uint32_t read_rom_uint(FILE *pFile, uint32_t address)
{
    if (fseek(pFile, address, SEEK_SET) != 0)
    {
        printf("failed to seek");
    }

    uint32_t value = 0;
    int result = fread(&value, sizeof(value), 1, pFile);
    printf("read %d bytes from %d\n", result, address);

    return endian_swap(value);
}

rom_reader init_file_reader(char *filename)
{
    pFile = fopen(filename, "rb");
    if (pFile == NULL)
    {
        fputs("File error", stderr);
        exit(1);
    }

    int length = 0x100;
    code = malloc(length);

    return read_from_file;
}

struct SqlResult must_run_sql(const char *sql) {
    struct SqlResult result = run_sql(sql);
    if (result.zErrMsg) {
        printf("SQL error: %s\n", result.zErrMsg);
        exit(1);
    }
}

#ifdef OWN_APP
int main(int argc, char **argv)
{
    if (argc < 2) {
        fputs("Please provide a filename\n", stderr);
        exit(1);
    }

    init_db(argv[1]);

    printf("db connected\n");
    must_run_sql("DELETE FROM \"instructions\";");
    must_run_sql("DELETE FROM \"functions\";");
    must_run_sql("DELETE FROM \"jump_tables\";");

    init_file_reader(argv[1]);

    // First 256 bytes contain different vectors
    populate_data(pFile, 0, 0x100, 4);

    uint32_t entry_point = read_rom_uint(pFile, 0x4);
    uint32_t irq_l6 = read_rom_uint(pFile, 0x78);

    struct FromTo start = {.to = entry_point, .from = 0};
    add_visited_branch(start);
    extract_functions(0x4, entry_point, read_from_file);

    struct FromTo start2 = {.to = irq_l6, .from = 0};
    add_visited_branch(start2);
    extract_functions(0x78, irq_l6, read_from_file);

    return 0;
}
#endif
