#!/usr/bin/env python3
"""
Seed Convex (local or remote) with appointments that fall into the reminder windows.

This repo does not include an official Python Convex client, so this script uses the
Convex CLI (`npx convex run`) to invoke an internal seed action implemented in:
  convex/reminders.ts -> internal.reminders.seedRemindersTestData

Usage examples:
  python3 scripts/seed_reminders.py
  python3 scripts/seed_reminders.py --count-1h 5 --count-24h 5
  python3 scripts/seed_reminders.py --minutes-1h 70 --minutes-24h 1450

After seeding, run in Convex dashboard:
  Functions -> reminders -> testCheckReminders -> Run
"""

import argparse
import json
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count-1h", type=int, default=2)
    parser.add_argument("--count-24h", type=int, default=2)
    parser.add_argument("--minutes-1h", type=int, default=65)
    parser.add_argument("--minutes-24h", type=int, default=24 * 60 + 10)
    parser.add_argument("--team-name", type=str, default="Seed Team")
    args = parser.parse_args()

    payload = {
        "count1h": args.count_1h,
        "count24h": args.count_24h,
        "minutesFromNowFor1h": args.minutes_1h,
        "minutesFromNowFor24h": args.minutes_24h,
        "reuseTeamName": args.team_name,
    }

    cmd = [
        "npx",
        "convex",
        "run",
        "internal.reminders.seedRemindersTestData",
        json.dumps(payload),
    ]

    print("Running:", " ".join(cmd))
    try:
        subprocess.run(cmd, check=True)
        return 0
    except subprocess.CalledProcessError as e:
        print(f"Seed failed (exit {e.returncode}).", file=sys.stderr)
        return e.returncode


if __name__ == "__main__":
    raise SystemExit(main())


