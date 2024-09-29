#include <stdio.h>
#include <netdb.h>
#include <netinet/in.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h> // read(), write(), close()
#define MAX 1000
#define PORT 6800
#define SA struct sockaddr
#include <errno.h>
#include <pthread.h>

// To get access to CPU registers
#include "m68k.h"
// To get read_memory
#include "debug.h"
// To access pause_emu
#include "main.h"

u_char checksum(const void *buf)
{
    u_char sum = 0;
    for (size_t i = 0; i < strlen(buf); i++)
    {
        sum += ((u_char *)buf)[i];
    }
    return sum;
}

void reply(int connfd, const void *buf)
{
    int len = strlen(buf);
    char *withChecksum = malloc(len + 5); // 2 for +$ and 3 for #checksum
    sprintf(withChecksum, "+$%s#%02X", buf, checksum(buf));
    printf("C:%s\n", withChecksum);
    write(connfd, withChecksum, len + 5);
}

void toHex(u_char *arr, char *output, uint length)
{
    for (int i = 0; i < length; i++)
        output += sprintf(output, "%02X", arr[i]);
}

void toHexUInt(uint *arr, char *output, uint length)
{
    for (int i = 0; i < length; i++)
        output += sprintf(output, "%08X", arr[i]);
}

uint8_t hexToBin(const char *str, uint8_t *bytes, size_t blen)
{
    uint8_t pos;
    uint8_t idx0;
    uint8_t idx1;

    // mapping of ASCII characters to hex values
    const uint8_t hashmap[] =
        {
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //  !"#$%&'
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ()*+,-./
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, // 01234567
            0x08, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 89:;<=>?
            0x00, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x00, // @ABCDEFG
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // HIJKLMNO
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // PQRSTUVW
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // XYZ[\]^_
            0x00, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x00, // `abcdefg
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // hijklmno
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // pqrstuvw
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // xyz{|}~.
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ........
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00  // ........
        };

    bzero(bytes, blen);
    for (pos = 0; ((pos < (blen * 2)) && (pos < strlen(str))); pos += 2)
    {
        idx0 = (uint8_t)str[pos + 0];
        idx1 = (uint8_t)str[pos + 1];
        bytes[pos / 2] = (uint8_t)(hashmap[idx0] << 4) | hashmap[idx1];
        printf("%X\n", bytes[pos / 2]);
    };

    return (0);
}

static int sockfd, connfd = 0;

void *gdb_packet_handler(void *vconnfd)
{
    char buff[MAX];
    int n;
    for (;;)
    {
        bzero(buff, MAX);

        // read the message from client and copy it in buffer
        int bRead = read(connfd, buff, sizeof(buff));
        // print buffer which contains the client contents
        printf("From GDB: %s %d\n", buff, bRead);
        if (bRead == 0)
        {
            printf("closing socket\n");
            close(connfd);
            connfd = 0;
            break;
        }

        char *offset = buff;
        if (buff[0] == '+')
        {
            offset += 1;
        }

        // Ctrl+c interrupt
        if (buff[0] == 3)
        {
            printf("handling ctrl+c\n");
            dbg_paused = 1;
            continue;
        }

        if (strstr(offset, "$?#") == offset)
        {
            reply(connfd, "S05");
        }
        // Continue
        else if (strstr(offset, "$c#") == offset)
        {
            dbg_step_over = 0;
            dbg_step_over_line = 0;
            dbg_trace = 0;
            pause_emu = 0;
            reply(connfd, "OK");
        }
        else if (offset[0] == '$' && offset[1] == 's')
        {
            // step command
            dbg_step_over = 0;
            dbg_step_over_line = 0;
            dbg_trace = 1;
            pause_emu = 0;
            reply(connfd, "OK");
        }
        else if (strstr(offset, "$qSupported") == offset)
        {
            reply(connfd, "hwbreak+;qXfer:exec-file:read+");
        }
        else if (strstr(offset, "$qXfer:exec-file:read") == offset)
        {
            reply(connfd, "l/Users/eugene/SGDK/sample/game/sonic/out/rom.out");
        }
        else if (strstr(offset, "$g#") == offset)
        {
            // Register read
            char output[16 * 8 + 1];
            uint32_t reg_states[18];
            memset(reg_states, 0, sizeof(reg_states));
            memcpy(reg_states, m68k.dar, sizeof(uint32_t) * 16);
            reg_states[17] = m68k.pc;

            toHexUInt(reg_states, output, 18);
            reply(connfd, output);
        }
        else if (offset[0] == '$' && offset[1] == 'm')
        {
            // Memory read - “m<addr>,<length>”
            uint32_t address = strtol(strtok(offset + 2, ","), NULL, 16);
            uint32_t length = strtol(strtok(NULL, "#"), NULL, 16);

            u_char *mem = read_memory(length, address);

            char *output = malloc(length * 2 + 1);
            toHex(mem, output, length);

            reply(connfd, output);
            free(output);
            free(mem);
        }
        else if (offset[0] == '$' && offset[1] == 'M')
        {
            // Memory write - ‘M<addr>,<length>:XX…’
            uint32_t address = strtol(strtok(offset + 2, ","), NULL, 16);
            uint32_t length = strtol(strtok(NULL, ":"), NULL, 16);

            uint8_t *bytes = malloc(length);
            hexToBin(strtok(NULL, "#"), bytes, length);

            for (size_t i = 0; i < length; i++)
            {
                write_memory_byte(address + i, bytes[i], NULL);
            }
            reply(connfd, "OK");
            free(bytes);
        }
        else if (strstr(offset, "$P") == offset)
        {
            // Write register - 'PN=R'
            uint32_t reg = strtol(strtok(offset + 2, "="), NULL, 16);
            uint32_t value = strtol(strtok(NULL, "#"), NULL, 16);
            if (reg == 17)
            {
                reg = 16;
            }
            m68k_set_reg(reg, value);
            reply(connfd, "OK");
        }
        // Insert hardware breakpoint
        else if (strstr(offset, "$Z") == offset)
        {
            // ‘Z1,addr,kind’
            uint32_t address = strtol(strtok(offset + 3, ","), NULL, 16);
            add_bpt(HOOK_M68K_E, address, 1, 0, 0);
            reply(connfd, "OK");
        }
        // Remove hardware breakpoint
        else if (strstr(offset, "$z") == offset)
        {
            // ‘z1,addr,kind’
            uint32_t address = strtol(strtok(offset + 3, ","), NULL, 16);
            delete_breakpoint_with_address(address);
            reply(connfd, "OK");
        }
        // General handler for anything else
        else if (offset[0] == '$')
        {
            reply(connfd, "");
        }
    }
}

/**
 * @brief Called when we receive an event from debugger
 */
static void debug_event_handler(dbg_event_t type, void *data)
{
    if (connfd == 0) {
        return;
    }

    if (type == DBG_STEP)
    {
        // reply(connfd, "T05hwbreak:;");
        reply(connfd, "S05");
    }
}

void *gdb_accept(void *vsockfd)
{
    struct sockaddr_in cli;
    int len;

    len = sizeof(cli);

    while (1)
    {
        // Accept the data packet from client and verification
        connfd = accept(sockfd, (SA *)&cli, (uint *)&len);
        if (connfd < 0)
        {
            printf("server accept failed...\n");
            exit(0);
        }
        else
            printf("server accept the client...\n");

        pthread_t client_thread;
        if (pthread_create(&client_thread, NULL, gdb_packet_handler, (void *)connfd))
        {
            printf("pthread_create failed");
            exit(0);
        }

        pthread_detach(client_thread);
    }
}

void start_gdb_server()
{
    struct sockaddr_in servaddr;

    // socket create and verification
    sockfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sockfd == -1)
    {
        printf("socket creation failed...\n");
        exit(0);
    }
    else
        printf("Socket successfully created..\n");
    bzero(&servaddr, sizeof(servaddr));

    // assign IP, PORT
    servaddr.sin_family = AF_INET;
    servaddr.sin_addr.s_addr = htonl(INADDR_ANY);
    servaddr.sin_port = htons(PORT);

    int reuse = 1;
    /* Reuse previous address. */
    if (setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse,
                   sizeof(reuse)) < 0)
    {
        printf("setsockopt(SO_REUSEADDR) failed");
        exit(0);
    }

    // Binding newly created socket to given IP and verification
    if ((bind(sockfd, (SA *)&servaddr, sizeof(servaddr))) != 0)
    {
        printf("socket bind failed... %d\n", errno);
        exit(0);
    }
    else
        printf("Socket successfully binded..\n");

    // Now server is ready to listen and verification
    if ((listen(sockfd, 5)) != 0)
    {
        printf("Listen failed...\n");
        exit(0);
    }
    else
        printf("Server listening..\n");

    set_debug_hook(debug_event_handler);

    pthread_t client_thread;
    if (pthread_create(&client_thread, NULL, gdb_accept, NULL))
    {
        printf("pthread_create failed");
        exit(0);
    }

    pthread_detach(client_thread);
}
