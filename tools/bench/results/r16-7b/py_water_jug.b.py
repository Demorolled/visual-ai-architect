from collections import deque

def water_jug(cap_a, cap_b, target):
    def neighbors(a, b):
        c = [(0, b), (a, 0), (a, cap_b), (0, a+b) if a+b<=cap_b else (a-(cap_b-b), cap_b), (a+b, 0) if a+b<=cap_a else (cap_a, a-(cap_a-(b-a)))]
        return [(x, y) for x, y in c if 0<=x<=cap_a and 0<=y<=cap_b]
    start = (0, 0)
    if target == 0: return [start]
    q = deque([(start, [start], set())])
    visited = set([start])
    while q:
        (a, b), path, seen = q.popleft()
        for na, nb in neighbors(a, b):
            if (na, nb) == (0, 0): continue
            if (na, nb) == (target, 0) or (na, nb) == (0, target):
                path.append((na, nb))
                return path
            if (na, nb) not in seen:
                seen.add((na, nb))
                q.append(((na, nb), path + [(na, nb)], seen))
    return None