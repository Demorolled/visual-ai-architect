import math
import random


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def main() -> None:
    random.seed(1)
    X = [[0, 0], [0, 1], [1, 0], [1, 1]]
    Y = [0, 1, 1, 0]
    # 2-2-1 MLP: hidden weights 2x2, output weights 2
    w1 = [[random.uniform(-1, 1) for _ in range(2)] for _ in range(2)]
    b1 = [random.uniform(-1, 1) for _ in range(2)]
    w2 = [random.uniform(-1, 1) for _ in range(2)]
    b2 = random.uniform(-1, 1)

    for _ in range(20000):
        for x, y in zip(X, Y):
            h = [sigmoid(sum(w * xi for w, xi in zip(wr, x)) + b) for wr, b in zip(w1, b1)]
            out = sigmoid(sum(w * hi for w, hi in zip(w2, h)) + b2)
            d_out = (y - out) * out * (1 - out)
            d_h = [w2[j] * d_out * h[j] * (1 - h[j]) for j in range(2)]
            for j in range(2):
                for i in range(2):
                    w1[j][i] += 0.9 * d_h[j] * x[i]
                b1[j] += 0.9 * d_h[j]
            for j in range(2):
                w2[j] += 0.9 * d_out * h[j]
            b2 += 0.9 * d_out

    for x, y in zip(X, Y):
        h = [sigmoid(sum(w * xi for w, xi in zip(wr, x)) + b) for wr, b in zip(w1, b1)]
        out = sigmoid(sum(w * hi for w, hi in zip(w2, h)) + b2)
        print(round(out, 1))


if __name__ == '__main__':
    main()
