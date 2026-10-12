from collections import deque

def water_jug(cap_a, cap_b, target):
    def neighbors(a, b):
        c = (cap_a - a, 0)
        d = (0, cap_b)
        e = (a, cap_b)
        f = (cap_a, b)
        g = (0, b)
        h = (a, 0)
        i = (min(a + b, cap_a), max(0, a + b - cap_a))
        j = (max(0, a + b - cap_b), min(b + a, cap_b))
        return [c, d, e, f, g, h, i, j]
    start = (0, 0)
    if target == 0: return [start]
    queue = deque([(start, [start])])
    visited = set([start])
    while queue:
        (a, b), path = queue.popleft()
        for na, nb in neighbors(a, b):
            if (na, nb) == (0, target): return path + [(na, nb)]
            if (na, nb) not in visited:
                visited.add((na, nb))
                queue.append(((na, nb), path + [(na, nb)]))
    return None