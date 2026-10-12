import sys


def summarize(text: str) -> tuple[int, int]:
    words = text.split()
    return len(words), len(set(words))


def main() -> None:
    count, distinct = summarize(sys.stdin.read())
    print(f"words={count} distinct={distinct}")


if __name__ == "__main__":
    main()
