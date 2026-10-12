import java.util.Random;

/**
 * Enemy — an invader descending from the top of the play field.
 * Each enemy has hit points and a descent speed; stronger waves have
 * tougher, faster enemies.
 */
public class Enemy {
  private int x;
  private int y;
  private int health;
  private final int speed;
  private final Random random = new Random();

  public Enemy(int x, int y, int health, int speed) {
    this.x = x;
    this.y = y;
    this.health = health;
    this.speed = speed;
  }

  /** Descend one step; drift sideways a little for a livelier pattern. */
  public void move() {
    y += speed;
    if (random.nextInt(3) == 0) x += random.nextBoolean() ? 1 : -1;
    x = Math.max(0, Math.min(79, x));
  }

  /** Re-spawn near the top at a fresh column (used when one exits the bottom). */
  public void reset(int newX, int newY) {
    this.x = newX;
    this.y = newY;
  }

  public void damage(int amount) {
    health -= amount;
  }

  public boolean isDead() {
    return health <= 0;
  }

  public int getX() { return x; }
  public int getY() { return y; }
  public int getHealth() { return health; }
}
