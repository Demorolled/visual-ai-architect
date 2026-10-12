/**
 * Player — the player's ship on the bottom line of the play field.
 * Moves left/right within the field and carries health.
 */
public class Player {
  private int x;
  private final int y;
  private int health;
  private final int maxHealth;
  private final int speed;

  public Player(int x, int y, int health, int speed) {
    this.x = x;
    this.y = y;
    this.health = health;
    this.maxHealth = health;
    this.speed = speed;
  }

  /** Move left or right by one step, clamped to the field width. */
  public void move(int direction) {
    x = Math.max(1, Math.min(78, x + direction * speed));
  }

  public void damage(int amount) {
    health -= amount;
  }

  public void healToFull() {
    health = maxHealth;
  }

  public int getX() { return x; }
  public int getY() { return y; }
  public int getHealth() { return health; }
  public int getMaxHealth() { return maxHealth; }
}
