def is_palindrome(word):
    cleaned_word = ''.join(c.lower() for c in word if c.isalnum())
    return cleaned_word == cleaned_word[::-1]

if __name__ == '__main__':
    words = ['level', 'world', 'civic', 'programming', 'madam']
    for word in words:
        if is_palindrome(word):
            print(f'"{word}" is a palindrome.')
        else:
            print(f'"{word}" is not a palindrome.')