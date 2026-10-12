import sys

def is_palindrome(s):
    s = s.replace(' ', '').replace('.', '').lower()
    return s == s[::-1]

def main():
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
    else:
        input_text = ''.join(line for line in sys.stdin.read().splitlines())
    
    is_palin = is_palindrome(input_text)
    print(is_palin)

if __name__ == "__main__":
    main()