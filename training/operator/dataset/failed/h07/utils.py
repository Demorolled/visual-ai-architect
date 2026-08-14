import hashlib
import os
import secrets

SALT_LEN = 16

def hash_password(password): 
    salt = secrets.token_bytes(SALT_LEN)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000)
    return salt.hex() + key.hex()

export = hash_password