import hashlib
import json
import os
import secrets

PASSWORD_FILE = 'password.json'

def store_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    with open(PASSWORD_FILE, 'w') as f:
        json.dump({'salt': salt.hex(), 'hash': hashed.hex()}, f)
    return hashed.hex()

def verify_password(password: str) -> bool:
    if not os.path.exists(PASSWORD_FILE):
        return False
    with open(PASSWORD_FILE) as f:
        data = json.load(f)
    salt = bytes.fromhex(data['salt'])
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return hashed.hex() == data['hash']

def main() -> None:
    password = 'correct horse battery staple'
    store_password(password)
    ok = verify_password(password)
    print(f'Password verified: {ok}')

if __name__ == '__main__':
    main()
