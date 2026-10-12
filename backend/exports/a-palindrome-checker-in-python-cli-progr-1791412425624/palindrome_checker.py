def check(word):
    cleaned_word = ''.join(c.lower() for c in word if c.isalnum())
    return cleaned_word == cleaned_word[::-1]