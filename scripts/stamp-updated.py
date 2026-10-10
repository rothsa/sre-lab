#!/usr/bin/env python3
"""Stamp an "updated <date>" label on every lab page and landing tile.

The date for each page is the last commit that changed that page's directory, ignoring commits that only
restamp dates (subject starts with "Stamp updated dates"). Uncommitted changes in a directory count as today.
Run from the repo root before committing a content change:  python3 scripts/stamp-updated.py
"""
import datetime, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAMP_SUBJECT = "Stamp updated dates"

def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()

def last_changed(d):
    if git("status", "--porcelain", "--", d):
        return datetime.date.today()
    for line in git("log", "--format=%cs\t%s", "--", d).splitlines():
        day, subject = line.split("\t", 1)
        if not subject.startswith(STAMP_SUBJECT):
            return datetime.date.fromisoformat(day)
    return None

def fmt(day):
    return f"{day.day} {day.strftime('%b %Y')}"

pages = sorted(d for d in os.listdir(ROOT)
               if os.path.isfile(os.path.join(ROOT, d, "index.html")) and d not in ("private", "drawn", "scripts"))
dates = {}
for d in pages:
    day = last_changed(d)
    if not day:
        continue
    dates[d] = day
    p = os.path.join(ROOT, d, "index.html")
    s = open(p).read()
    label = f'<span class="updated"> · updated <time datetime="{day.isoformat()}">{fmt(day)}</time></span>'
    s2, n = re.subn(r'<span class="updated">.*?</span>', label, s, count=1)
    if n == 0:  # first run: put it at the end of the kicker line
        s2, n = re.subn(r'(<div class="kicker">.*?)(</div>)', lambda m: m.group(1) + label + m.group(2), s, count=1, flags=re.S)
    if n and s2 != s:
        open(p, "w").write(s2)

# Landing tiles: one "updated" line per tile
p = os.path.join(ROOT, "index.html"); s = open(p).read()
def tile(m):
    href, body = m.group(1), m.group(2)
    d = href.strip("/")
    if d not in dates:
        return m.group(0)
    body = re.sub(r'<em class="upd">.*?</em>', "", body)
    return f'<a class="tool" href="{href}">{body}<em class="upd">updated <time datetime="{dates[d].isoformat()}">{fmt(dates[d])}</time></em></a>'
s2 = re.sub(r'<a class="tool" href="([^"]+)">(.*?)</a>', tile, s)
if ".tool .upd" not in s2:
    s2 = s2.replace("</style>", "a.tool .upd { font-family: var(--font-mono); font-style: normal; font-size: 11.5px; letter-spacing: .04em; color: var(--muted); }\n</style>", 1)
if s2 != s:
    open(p, "w").write(s2)
for d in pages:
    print(f"{d:22} {fmt(dates[d]) if d in dates else '-'}")
