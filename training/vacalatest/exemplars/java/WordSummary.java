import java.util.HashSet;
import java.util.Scanner;
import java.util.Set;

/**
 * Java exemplar: public class name matches the file name, java.util only, and
 * Scanner instead of System.console() (which is null on piped stdin).
 */
public class WordSummary {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        StringBuilder sb = new StringBuilder();
        while (in.hasNextLine()) {
            sb.append(in.nextLine()).append('\n');
        }

        String[] words = sb.toString().trim().split("\\s+");
        int count = 0;
        Set<String> distinct = new HashSet<>();
        for (String word : words) {
            if (word.isEmpty()) {
                continue;
            }
            count++;
            distinct.add(word);
        }

        System.out.println("words=" + count + " distinct=" + distinct.size());
    }
}
