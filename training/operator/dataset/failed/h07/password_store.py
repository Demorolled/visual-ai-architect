import json
import os
import utils

def store_password(password):
    if not os.path.exists('password.json'):
        with open('password.json', 'w') as f:
            json.dump({}, f)
    with open('password.json', 'r') as f:
        data = json.load(f)
    salt = utils.generate_salt()
    hashed = utils.hash_password(password, salt)
    data['hashed'] = hashed
    with open('password.json', 'w') as f:
        json.dump(data, f)

def load_password():
    if not os.path.exists('password.json'):
        return ''
    with open('password.json', 'r') as f:
        data = json.load(f)
    return data.get('hashed', '')