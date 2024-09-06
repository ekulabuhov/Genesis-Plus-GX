#include "storage.h"
#include "storage_tests.h"

static void *
test_storage_setup(const MunitParameter params[], void *user_data)
{
    remove("test-db.sqlite3");
    init_db("test-db.sqlite3");
}

static MunitResult test_add_comment(const MunitParameter params[], void *data)
{
    // Insert a dummy instruction at address 0x0
    run_sql("INSERT INTO instructions (address, mnemonic, op_str) VALUES ('0', 'dc.l', '200')");
    struct SqlResult result = add_comment(0, "new-comment");
    munit_assert_null(result.zErrMsg);
    munit_assert_int(result.rowsAffected, ==, 1);

    uint32_t index = 1;
    char *errMsg;
    result = get_instructions(&index, 0, 0, 0, &errMsg);
    // assert column name
    munit_assert_string_equal(result.aResult[4], "comment");
    // assert column content
    munit_assert_string_equal(result.aResult[9], "new-comment");

    return 0;
}

static MunitTest tests[] = {
    {
        "/test-add-comment",    /* name */
        test_add_comment,           /* test */
        test_storage_setup,     /* setup */
        NULL,                   /* tear_down */
        MUNIT_TEST_OPTION_NONE, /* options */
        NULL                    /* parameters */
    },
    /* Mark the end of the array with an entry where the test
     * function is NULL */
    {NULL, NULL, NULL, NULL, MUNIT_TEST_OPTION_NONE, NULL}};

const MunitSuite storage_suite = {
    "/storage-tests",       /* name */
    tests,                  /* tests */
    NULL,                   /* suites */
    1,                      /* iterations */
    MUNIT_SUITE_OPTION_NONE /* options */
};
