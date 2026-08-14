def sigmoid(z: float) -> float:
    return 1 / (1 + math.exp(-z))

def d_sigmoid(z: float) -> float:
    s = sigmoid(z)
    return s * (1 - s)

xor_data = [
    {"input": [0, 0], "expected": 0},
    {"input": [0, 1], "expected": 1},
    {"input": [1, 0], "expected": 1},
    {"input": [1, 1], "expected": 0},
]