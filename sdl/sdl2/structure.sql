CREATE TABLE "instructions" ("id" integer,"address" integer,"mnemonic" text,"op_str" text, "size" integer, "op_1" text, PRIMARY KEY (id));
CREATE UNIQUE INDEX "address_uniq" ON "instructions" ("address");

CREATE TABLE "instruction_comments" ("id" integer,"address" int NOT NULL,"comment" text, PRIMARY KEY (id));
CREATE UNIQUE INDEX "ic_address_unique" ON "instruction_comments" ("address");

CREATE TABLE "labels" ("id" integer,"address" text,"name" text, "source" text, PRIMARY KEY (id));
CREATE UNIQUE INDEX "labels_address_uniq" ON "labels" ("address");

CREATE TABLE "functions" ("id" integer,"start_address" integer,"end_address" integer, PRIMARY KEY (id));
CREATE UNIQUE INDEX "sa_uniq" ON "functions" ("start_address");

CREATE TABLE "jump_tables" ("id" integer, "instruction_address" integer NOT NULL, "function_start_address" integer NOT NULL, "type" text, PRIMARY KEY (id));
CREATE UNIQUE INDEX "ref_unique" ON "jump_tables" ("instruction_address","function_start_address");