import argparse
from sys import stdin

def is_palindrome(s):
    s = ''.join(e for e in s if e.isalnum()).lower()
    return s == s[::-1]

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check if a string is a palindrome")
    parser.add_argument("-i", "--input", type=str, help="Input string to check (overrides reading from stdin)")
    
    args = parser.parse_args()

    # Get input
    user_input = ""
    try:
        user_input = next(stdin).rstrip('\n')
    except StopIteration as e:
        print("No input provided")
        exit(1)

    if is_palindrome(user_input):
        print(f"The string '{user_input.strip()}' is a palindrome.")
    else:
        print(f"The string '{user_input.strip()}' is NOT a palindrome.")