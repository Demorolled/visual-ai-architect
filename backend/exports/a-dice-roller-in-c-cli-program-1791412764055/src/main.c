#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int roll_die(int sides) {
    return rand() % sides + 1;
}

int main(int argc, char *argv[]) {
    int die_type = 6;
    if (argc > 1) {
        die_type = atoi(argv[1]);
    }

    printf("Rolling a d%d...\n", die_type);

    switch (die_type) {
        case 4:
            int result = roll_die(4);
            printf("Result: %d\n", result);
            break;
        case 6:
            result = roll_die(6);
            printf("Result: %d\n", result);
            break;
        case 8:
            result = roll_die(8);
            printf("Result: %d\n", result);
            break;
        default:
            printf("Invalid die type. Only d4, d6 and d8 are supported.\n");
    }

    return 0;
}