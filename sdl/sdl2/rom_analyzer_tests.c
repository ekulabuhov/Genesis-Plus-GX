#include <stdlib.h>
#include <stdio.h>
#include "rom_analyzer_tests.h"
#include "munit/munit.h"

#ifdef TEST_APP

struct test {
    char* name;
    int failed;
};

#define munit_assert_hex_equal(a, b) \
    munit_assert_type(int, "2X", a, ==, b)

int main() {
    struct test t = {.name = "function_with_branch"};

    rom_reader rr = init_file_reader();

    struct Function f = extract_function(0x100, 0x2dd26, rr);

    for (size_t i = 0; i < f.instruction_count; i++)
    {
        printf("%02X: %s\t %s\n", f.instructions[i]->address, f.instructions[i]->mnemonic, f.instructions[i]->op_str);
    }

    printf("%02X - %02X\n", f.start_address, f.end_address);

    munit_assert_hex_equal(0x2dd26, f.start_address);
    munit_assert_hex_equal(0x2DD52, f.end_address);
    
    return 0;
}

#endif
