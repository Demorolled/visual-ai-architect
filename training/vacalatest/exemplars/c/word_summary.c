#include <ctype.h>
#include <stdio.h>
#include <string.h>

#define MAX_WORDS 4096
#define MAX_LEN 128

/* A word character: letters, digits, and the in-word punctuation VACA allows. */
static int is_word_char(int c) {
    return isalnum(c) || c == '\'' || c == '-';
}

int main(void) {
    char words[MAX_WORDS][MAX_LEN];
    char buf[MAX_LEN];
    size_t n = 0;
    size_t blen = 0;
    int c;

    while ((c = getchar()) != EOF) {
        if (is_word_char(c)) {
            if (blen + 1 < MAX_LEN) {
                buf[blen++] = (char)c;
            }
        } else if (blen > 0) {
            buf[blen] = '\0';
            if (n < MAX_WORDS) {
                strcpy(words[n], buf);
                n++;
            }
            blen = 0;
        }
    }
    if (blen > 0 && n < MAX_WORDS) {
        buf[blen] = '\0';
        strcpy(words[n], buf);
        n++;
    }

    size_t distinct = 0;
    for (size_t i = 0; i < n; i++) {
        int seen = 0;
        for (size_t j = 0; j < i; j++) {
            if (strcmp(words[i], words[j]) == 0) {
                seen = 1;
                break;
            }
        }
        if (!seen) {
            distinct++;
        }
    }

    printf("words=%zu distinct=%zu\n", n, distinct);
    return 0;
}
