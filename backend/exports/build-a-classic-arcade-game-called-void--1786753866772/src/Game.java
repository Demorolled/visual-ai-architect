import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Void Raider — a classic terminal arcade game.
 *
 * Controls: A/D move left/right, SPACE fire, Q quit.
 * Enemies descend from the top in escalating waves; every wave cleared
 * advances the round and increases enemy count/speed/strength.
 */
public class Game {
  private static final int WIDTH = 80;
  private static final int HEIGHT = 25;

  private final Player player;
  private final List<Enemy> enemies = new ArrayList<>();
  private final List<Projectile> projectiles = new ArrayList<>();
  private final Random random = new Random();

  private int score = 0;
  private int round = 1;
  private int lives = 3;
  private long lastShot = 0;
  private boolean gameOver = false;

  public Game() {
    player = new Player(WIDTH / 2, HEIGHT - 3, 100, 3);
    startWave();
  }

  private void startWave() {
    enemies.clear();
    int count = Math.min(4 + round * 2, 24);
    int hp = 1 + round / 3;
    int speed = 1 + round / 4;
    int cols = 8;
    int spacing = (WIDTH - 16) / cols;
    for (int i = 0; i < count; i++) {
      int row = i / cols;
      int col = i % cols;
      enemies.add(new Enemy(8 + col * spacing, 1 + row * 2, hp, speed));
    }
  }

  /** One game tick: read input, move everything, resolve collisions, render. */
  public void tick(char key) throws InterruptedException {
    if (gameOver) return;

    if (key == 'q' || key == 'Q') { gameOver = true; return; }
    if (key == 'a' || key == 'A') player.move(-1);
    if (key == 'd' || key == 'D') player.move(1);
    if ((key == ' ' || key == 'f' || key == 'F') && System.currentTimeMillis() - lastShot > 250) {
      projectiles.add(new Projectile(player.getX(), player.getY() - 1, 1, 1));
      lastShot = System.currentTimeMillis();
    }

    // Move enemies down; wrap to a fresh column when they leave the bottom.
    for (Enemy e : enemies) {
      e.move();
      if (e.getY() > HEIGHT - 1) {
        e.reset(1 + random.nextInt(WIDTH - 8), random.nextInt(3) + 1);
      }
    }

    // Move projectiles and resolve hits.
    for (int i = projectiles.size() - 1; i >= 0; i--) {
      Projectile p = projectiles.get(i);
      p.move();
      boolean hit = false;
      for (int j = enemies.size() - 1; j >= 0; j--) {
        Enemy e = enemies.get(j);
        if (Math.abs(p.getX() - e.getX()) <= 1 && Math.abs(p.getY() - e.getY()) <= 1) {
          e.damage(p.getDamage());
          if (e.isDead()) { enemies.remove(j); score += 10 * round; }
          hit = true;
          break;
        }
      }
      if (hit || p.getY() < 0) projectiles.remove(i);
    }

    // Enemies reaching the player's line cost a life.
    for (int j = enemies.size() - 1; j >= 0; j--) {
      Enemy e = enemies.get(j);
      if (e.getY() >= HEIGHT - 2) {
        enemies.remove(j);
        lives--;
        if (lives <= 0) { gameOver = true; return; }
      }
    }

    // Wave cleared → next round.
    if (enemies.isEmpty()) {
      round++;
      startWave();
    }
  }

  public String render() {
    char[][] grid = new char[HEIGHT][WIDTH];
    for (int y = 0; y < HEIGHT; y++)
      for (int x = 0; x < WIDTH; x++)
        grid[y][x] = (y == 0 || y == HEIGHT - 1) ? '-' : '.';

    for (Enemy e : enemies)
      if (e.getY() >= 0 && e.getY() < HEIGHT && e.getX() >= 0 && e.getX() < WIDTH)
        grid[e.getY()][e.getX()] = 'V';

    for (Projectile p : projectiles)
      if (p.getY() >= 0 && p.getY() < HEIGHT && p.getX() >= 0 && p.getX() < WIDTH)
        grid[p.getY()][p.getX()] = '|';

    int px = player.getX(), py = player.getY();
    if (py >= 0 && py < HEIGHT && px >= 0 && px < WIDTH) grid[py][px] = '^';

    StringBuilder sb = new StringBuilder();
    for (int y = 0; y < HEIGHT; y++) {
      sb.append(new String(grid[y])).append('\n');
    }
    sb.append(String.format("Score: %d   Lives: %s   Round: %d%n", score, "▲".repeat(Math.max(0, lives)), round));
    if (gameOver) sb.append("GAME OVER — press R to restart, Q to quit\n");
    sb.append("A/D move · SPACE fire · Q quit\n");
    return sb.toString();
  }

  public boolean isGameOver() { return gameOver; }
  public int getScore() { return score; }

  public static void main(String[] args) throws IOException, InterruptedException {
    Game game = new Game();
    System.out.print("\033[H\033[2J");
    System.out.print(game.render());

    while (true) {
      int c = System.in.available() > 0 ? System.in.read() : -1;
      if (c == -1) { Thread.sleep(120); continue; }
      char key = (char) c;
      if (key == 'r' || key == 'R') {
        if (game.isGameOver()) game = new Game();
        continue;
      }
      game.tick(key);
      System.out.print("\033[H\033[2J");
      System.out.print(game.render());
      if (game.isGameOver() && key == 'q') break;
      if (game.isGameOver() && key == 'Q') break;
      Thread.sleep(120);
    }
  }
}
