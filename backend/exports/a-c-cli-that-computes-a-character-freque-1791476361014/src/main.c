#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_LINE_LENGTH 1024

typedef struct {
    char character;
    int count;
} CharacterFrequency;

int compare_characters(const void* a, const void* b) {
    return ((CharacterFrequency*)b)->count - ((CharacterFrequency*)a)->count;
}

void compute_histogram(char** buffer_out, size_t* lines_count_out) {
    FILE *file = fopen("data.txt", "rb");
    if (!file) { fprintf(stderr, "Error opening file.\n"); exit(1); }

    CharacterFrequency freq_table[256];

    for (int i = 0; i < 256; ++i)
        freq_table[i] = (CharacterFrequency){ (char)i, 0 };

    char line[MAX_LINE_LENGTH + 1];
    
    size_t num_unique_chars = 0;
    while (fgets(line, sizeof(line), file) != NULL){
        for (int i = 0; line[i] != '\0'; ++i)
            if (++freq_table[(unsigned char)line[i]].count == 1) num_unique_chars++;
    }
    
    qsort(freq_table,num_unique_chars,sizeof(CharacterFrequency),compare_characters);

    // Print the histogram
    printf("Character Frequency Histogram:\n");
    for (int i = 0; i < num_unique_chars && freq_table[i].count > 0 ; ++i)
        printf("%c:   %d\n",freq_table[i].character,freq_table[i].count);
    
    fclose(file);

}

int main(int argc, char** argv) {
CharacterFrequency freq_table[256];
for (int i = 0; i < 256; ++i)
        freq_table[i] = CharacterFrequency{ (char)i, 0 };
printf("File has been read\n");
FILE* file = fopen(argv[1],"r");
if (!file){ fprintf(stderr,"Error opening input file: %s\n",argv[1]); return EXIT_FAILURE;
}  

    char buffer[MAX_LINE_LENGTH];
    size_t lines_count = 0;

    while (fgets(buffer, MAX_LINE_LENGTH, file)) {
        for (char* p = strtok(buffer, " \t\r\n"); p; p = strtok(NULL,
                " \t\n")) {lines_count++;
            freq_table[(unsigned char)*p].count++; } }

    fclose(file);

    qsort(freq_table,sizeof(freq_table)/sizeof(CharacterFrequency), sizeof(CharacterFrequency),compare_characters); 

    printf("Number of unique characters: %zu\n", lines_count);
  
    // print the histogram
    printf("\nCharacter Frequency Histogram:\n");
    for (int i=0; freq_table[i].count > 0 && i<256; ++i)
        printf("%c: %d\n", freq_table[i].character, freq_table[i].count);

return EXIT_SUCCESS;
}