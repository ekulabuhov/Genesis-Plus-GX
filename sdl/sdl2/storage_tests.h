#ifndef _STORAGE_TESTS_H_
#define _STORAGE_TESTS_H_

#include "munit/munit.h"

extern const MunitSuite storage_suite;
struct SqlResult get_instructions(uint32_t index, int as_json, size_t length_around);
void init_db(const char *filename);

#endif /* _STORAGE_TESTS_H_ */
