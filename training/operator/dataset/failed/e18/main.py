import re
from collections import defaultdict

def parse_log_line(line):
    if 'ERROR' in line:
        return (line, 'ERROR')
    else:
        return (line, 'INFO')

def parse_log(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    return lines

def parse_hour(timestamp):
    return timestamp[:16]

def summarize(lines):
    by_hour = defaultdict(lambda: {'info': 0, 'error': 0})
    errors = []
    for line in lines:
        timestamp = re.search(r'\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]', line)
        if not timestamp:
            continue
        timestamp = parse_hour(timestamp.group(1))
        info, level = parse_log_line(line)
        by_hour[timestamp][level] += 1
        if level == 'ERROR':
            errors.append(info)
    return by_hour, errors

def print_summary(by_hour, errors):
    print('Hourly Summary:')
    for hour, counts in sorted(by_hour.items()):
        print(f'{hour} | info: {counts["info"]} | error: {counts["error"]}')
    print('\nTop Errors:')
    for line in sorted(errors, key=lambda x: (-len(x), x))[:5]:
        print(line.strip())

def main(filename):
    lines = parse_log(filename)
    by_hour, errors = summarize(lines)
    print_summary(by_hour, errors)

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        print('Usage: python main.py <filename>')
        sys.exit(1)
    main(sys.argv[1])