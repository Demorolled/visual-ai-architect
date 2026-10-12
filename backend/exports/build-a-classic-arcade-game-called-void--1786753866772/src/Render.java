/**
 * Render — terminal drawing helpers for the game.
 * Renders the current game state to an ANSI-cleared terminal frame.
 */
public final class Render {
  private Render() {
    // utility class — no instances
  }

  /** ANSI escape to clear the screen and move the cursor home. */
  public static String clearScreen() {
    return "\033[H\033[2J";
  }

  /** Escape a one-line status strip (score / lives / round). */
  public static String status(int score, int lives, int round, int playerHealth, int playerMaxHealth) {
    StringBuilder sb = new StringBuilder();
    sb.append(String.format("Score: %d   Lives: %s   Round: %d", score, "▲".repeat(Math.max(0, lives)), round));
    int barWidth = 20;
    int filled = Math.round((barWidth * playerHealth) / (float) Math.max(1, playerMaxHealth));
    sb.append("   Hull: [");
    sb.append("█".repeat(Math.max(0, filled)));
    sb.append(" ".repeat(Math.max(0, barWidth - filled)));
    sb.append(']');
    return sb.toString();
  }
}
