#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h> /* atoi */
#include "dwarf.h"

// pipes[0]: parent writes, child reads (child's stdin)
// pipes[1]: child writes, parent reads (child's stdout)
static int inpipefd[2];
static int outpipefd[2];

dwarf_ask_t *dwarf_ask(unsigned int address)
{
    char msg[20];
    sprintf(msg, "0x%X\n", address);
    printf("sending %lu bytes, asking about %s\n", strlen(msg), msg);

    char line[200];
    write(outpipefd[1], msg, strlen(msg));

    while (1)
    {
        int readBytes = read(inpipefd[0], line, 199);
        printf("readBytes: %d\n", readBytes);
        if (readBytes <= 0)
        {
            // Closed?
            printf("readBytes is 0 or negative\n");
            return NULL;
        }
        line[readBytes] = 0;
        printf("[node]: %s", line);

        if (strstr(line, ">not found") != NULL)
        {
            return NULL;
        }

        if (line[0] == '>')
        {
            char *funcname = strtok(line + 1, " ");
            char *filename = strtok(NULL, " ");
            char *linenumber = strtok(NULL, " ");
            char *column = strtok(NULL, " ");

            dwarf_ask_t *response = malloc(sizeof(dwarf_ask_t));
            strcpy(response->function_name, funcname);
            strcpy(response->file_path, filename);
            response->line_number = atoi(linenumber);
            response->column = atoi(column);
            printf("funcname: %s, filename: %s, line: %s, column: %s\n", funcname, filename, linenumber, column);
            return response;
        }
    }
}

int dwarf_init(void)
{
    pipe(inpipefd);
    pipe(outpipefd);

    if (fork() > 0)
    {
        // close unused pipe ends
        close(outpipefd[0]);
        close(inpipefd[1]);
    }
    else
    {
        // child
        dup2(outpipefd[0], STDIN_FILENO);
        dup2(inpipefd[1], STDOUT_FILENO);
        dup2(inpipefd[1], STDERR_FILENO);

        // close unused pipe ends
        close(outpipefd[1]);
        close(inpipefd[0]);

        int res = execl("ts-node", "ts-node", "./sdl/sdl2/m68k-nodejs-gdb/index.ts", NULL);
        int errvalue = errno; // preserve value as first printf may change errno
        if (res == -1)
        {
            printf("failed to start ts-node %d, errno: %d\n", res, errvalue);
        }

        return errvalue;
    }

    return 0;
}
