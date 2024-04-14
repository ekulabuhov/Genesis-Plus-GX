NAME	  = rom_analyzer

CC        = gcc
CFLAGS    = -march=native -O0 -fomit-frame-pointer -Wall -Wno-strict-aliasing -std=c99 -pedantic-errors
# Flags required to build on MacOS. -g provides debug symbols.
CFLAGS   += -Wpedantic -Wno-c11-extensions -Winvalid-utf8 -Wstrict-prototypes -g

DEFINES   = -DOWN_APP

SRCDIR    = ../core
INCLUDES  = -I$(SRCDIR)
LIBS	  = 

CHDLIBDIR = $(SRCDIR)/cd_hw/libchdr


# Capstone disassembler
INCLUDES += -Isdl2/capstone/5.0.1/include
LIBS += -Lsdl2/capstone/5.0.1/lib -lcapstone

# Include sqlite
LIBS += -lsqlite3

OBJDIR = ./build_rom_analyzer

OBJECTS	=       $(OBJDIR)/rom_analyzer.o \
	$(OBJDIR)/storage.o \
	$(OBJDIR)/rom_analyzer_tests.o \
	$(OBJDIR)/storage_tests.o \
	$(OBJDIR)/munit.o

all: $(NAME)

$(NAME): $(OBJDIR) $(OBJECTS)
		$(CC) $(LDFLAGS) $(OBJECTS) $(LIBS) -o $@

$(OBJDIR) :
		@[ -d $@ ] || mkdir -p $@

$(OBJDIR)/%.o :	$(SRCDIR)/../sdl/sdl2/%.c $(SRCDIR)/../sdl/sdl2/%.h	        
		$(CC) -c $(CFLAGS) $(INCLUDES) $(DEFINES) $< -o $@

$(OBJDIR)/%.o :	$(SRCDIR)/../sdl/sdl2/munit/%.c $(SRCDIR)/../sdl/sdl2/munit/%.h	        
		$(CC) -c $(CFLAGS) $(INCLUDES) $(DEFINES) $< -o $@

clean:
	rm -f $(OBJECTS) $(NAME)

dune:
	./gen_sdl2 "Dune - The Battle for Arrakis (U) [!].gen"

emu:
	@make -f Makefile.sdl2

leaks:
	@leaks --atExit -- ./gen_sdl2 "Dune - The Battle for Arrakis (U) [\!].gen" > leaks.log

tests: DEFINES = -DTEST_APP
tests: all