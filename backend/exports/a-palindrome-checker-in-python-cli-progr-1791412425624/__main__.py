def is_palindrome(word):
    return word.lower() == word[::-1].lower()

def process(word):
    if is_palindrome(word):
        print(f"{word} is a palindrome.")
    else:
        print(f"{word} is not a palindrome.")

def main():
    print("Palindrome checker")
    while True:
        word = input("> ")
        if word == "":
            break
        process(word)

if __name__ == "__main__":
    main()