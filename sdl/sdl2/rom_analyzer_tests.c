#include <stdlib.h>
#include <stdio.h>
#include "rom_analyzer_tests.h"
#include "munit/munit.h"
#include "storage_tests.h"

#ifdef TEST_APP

#define munit_assert_hex_equal(a, b) \
  munit_assert_type(int, "2X", a, ==, b)

#define munit_assert_int_equal(a, b) \
  munit_assert_int(a, ==, b)

static void print_function(struct Function f)
{
  for (size_t i = 0; i < f.instruction_count; i++)
  {
    printf("%02X: %s\t %s\n", f.instructions[i]->address, f.instructions[i]->mnemonic, f.instructions[i]->op_str);
  }

  printf("%02X - %02X\n", f.start_address, f.end_address);
}

static rom_reader rr;

static MunitResult test_extract(const MunitParameter params[], void *data)
{
  const char *pair_string = munit_parameters_get(params, "pair");
  char *endp;
  int start_address = strtol(pair_string, &endp, 0);
  int end_address = strtol(endp, &endp, 0);
  int instruction_count = strtol(endp, &endp, 0);

  struct Function f = extract_function(0x100, start_address, rr);

  print_function(f);

  munit_assert_hex_equal(start_address, f.start_address);
  munit_assert_hex_equal(end_address, f.end_address);
  munit_assert_int_equal(f.instruction_count, instruction_count);
  munit_assert_hex_equal(f.instructions[f.instruction_count - 1]->address, f.end_address);

  return 0;
}

static char *pairs_params[] = {
    // Multiple rts's
    "0x5162 0x547a 121",
    // jump table with 16 bit offsets
    "0x20DA6 0x215B8 584",
    // 161f0 bra 16298 ; branch past code
    // 1629a bpl 161f4 ; return to skipped code
    // 241 instructions
    // 11 2 bytes words for jump table
    "0x1609C 0x1641A 241",
    // 27d2 beq 27dc ; conditional branch past unconditional branch
    // 27da bra 27d0 ; branch up
    // 27e0 rts
    "0x27ca 0x27e0 8",
    // 28c bra 2fa ; branch down past data
    "0x200 0x306 55",
    // 284a bne 2860 ; branch past rts
    // 285e rts ; early rts
    // 28d6 bra 28d6 ; lockup loop
    "0x282a 0x28d6 36",
    // 2dd2e beq 2dd34 ; branch past jmp
    // 2dd30 jmp 1664 ; early jmp that terminates fn
    // 2dd52 rts ; rts past the jmp
    "0x2dd26 0x2DD52 16",
    NULL};

static MunitParameterEnum test_params[] = {
    {"pair", pairs_params},
    {NULL, NULL},
};

/* The setup function, if you provide one, for a test will be run
 * before the test, and the return value will be passed as the sole
 * parameter to the test function. */
static void *
test_extract_setup(const MunitParameter params[], void *user_data)
{
  rr = init_file_reader("Dune - The Battle for Arrakis (U) [!].gen");
}

MunitTest tests[] = {
    {
        "/my-test",             /* name */
        test_extract,           /* test */
        test_extract_setup,     /* setup */
        NULL,                   /* tear_down */
        MUNIT_TEST_OPTION_NONE, /* options */
        test_params             /* parameters */
    },
    /* Mark the end of the array with an entry where the test
     * function is NULL */
    {NULL, NULL, NULL, NULL, MUNIT_TEST_OPTION_NONE, NULL}};

int main(int argc, char *argv[])
{
  const MunitSuite suites[] = {
      storage_suite,
      {NULL, NULL, NULL, 0, MUNIT_SUITE_OPTION_NONE},
  };
  const MunitSuite suite = {
      "/my-tests",            /* name */
      NULL, //tests,                  /* tests */
      (MunitSuite *)suites,   /* suites */
      1,                      /* iterations */
      MUNIT_SUITE_OPTION_NONE /* options */
  };

  return munit_suite_main(&suite, NULL, argc, argv);
}

#endif
