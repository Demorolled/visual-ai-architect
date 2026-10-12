from collections import deque

def water_jug(cap_a, cap_b, target):
    if target > cap_a and target > cap_b:
        return None
    start = (0, 0)
    queue = deque([start])
    visited = {start}
    parent = {start: None}
    while queue:
        a, b = queue.popleft()
        if a == target or b == target or a + b == target:
            path = [(a, b)]
            while parent[path[-1]]:
                path.append(parent[path[-1]])
            return path[::-1]
        for na, nb in [(cap_a, b), (a, cap_b), (0, b), (a, 0), (min(cap_a, a + b), max(0, b - (cap_a - a))), (max(0, a - (cap_b - b)), min(cap_b, a + b))]:
            if (na, nb) not in visited:
                visited.add((na, nb))
                parent[(na, nb)] = (a, b)
                queue.append((na, nb))
    return None