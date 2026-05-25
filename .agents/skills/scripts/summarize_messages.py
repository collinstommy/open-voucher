"""
Print basic statistics about cleaned messages for LLM consumption.

Usage:
    python3 summarize_messages.py <cleaned.json>
    python3 summarize_messages.py <cleaned.json> --all  # print full message texts
"""

import json, sys
from datetime import datetime, timezone
from collections import Counter

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <cleaned.json> [--all]")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        data = json.load(f)

    messages = data.get('messages', data.get('Messages', []))
    print(f"Total cleaned messages: {len(messages)}")
    if not messages:
        return

    # Date range
    timestamps = [m.get('createdAt', 0) for m in messages if m.get('createdAt')]
    if timestamps:
        oldest = datetime.fromtimestamp(min(timestamps) / 1000, tz=timezone.utc)
        newest = datetime.fromtimestamp(max(timestamps) / 1000, tz=timezone.utc)
        print(f"Date range: {oldest.strftime('%Y-%m-%d')} to {newest.strftime('%Y-%m-%d')}")

    # Monthly breakdown
    months = Counter()
    for ts in timestamps:
        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        months[dt.strftime('%Y-%m')] += 1
    print(f"\nMonthly breakdown:")
    for month in sorted(months.keys(), reverse=True):
        bar = '█' * months[month]
        print(f"  {month}: {months[month]:>4} {bar}")

    # Message length distribution
    lens = [len((m.get('text') or '').split()) for m in messages]
    print(f"\nWord count: min={min(lens)}, max={max(lens)}, avg={sum(lens)//len(lens)}")

    # Unique users
    users = set()
    for m in messages:
        u = m.get('user')
        if u and u.get('id'):
            users.add(u['id'])
    print(f"Unique users: {len(users)}")

    if '--all' in sys.argv:
        print(f"\n{'=' * 60}")
        for m in messages:
            print(f"[{m['text']}]")
        print(f"\n{'=' * 60}")
        print(f"End of {len(messages)} messages")


if __name__ == '__main__':
    main()
