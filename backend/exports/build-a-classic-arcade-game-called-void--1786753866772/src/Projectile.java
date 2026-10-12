/**
 * Projectile — a player shot travelling upward. Removed by the game loop
 * when it leaves the field or hits an enemy.
 */
public class Projectile {
  private int x;
  private int y;
  private final int speed;
  private final int damage;

  public Projectile(int x, int y, int speed, int damage) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.damage = damage;
  }

  public void move() {
    y -= speed;
  }

  public int getX() { return x; }
  public int getY() { return y; }
  public int getDamage() { return damage; }
}
