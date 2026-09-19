"""Apply dyzen schema SQL to Frequency Supabase via /pg/query.

Usage (from repo root, on the same LAN):
  set SUPABASE_URL=http://192.168.1.69:8000
  set SUPABASE_SERVICE_ROLE_KEY=...
  python scripts/apply_dyzen_schema.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "http://192.168.1.69:8000").rstrip("/")
SVC = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SQL_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "supabase",
    "migrations",
    "20260918120000_dyzen_full_schema.sql",
)

if not SVC:
    print("Set SUPABASE_SERVICE_ROLE_KEY in the environment.", file=sys.stderr)
    sys.exit(1)

with open(os.path.abspath(SQL_PATH), encoding="utf-8") as f:
    sql = f.read()

body = json.dumps({"query": sql}).encode("utf-8")
req = urllib.request.Request(
    f"{URL}/pg/query",
    data=body,
    headers={
        "Content-Type": "application/json",
        "apikey": SVC,
        "Authorization": f"Bearer {SVC}",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = resp.read().decode("utf-8", errors="replace")
        print("OK", resp.status)
        print(data[:2000])
except urllib.error.HTTPError as e:
    print("FAIL", e.code, file=sys.stderr)
    print(e.read().decode("utf-8", errors="replace")[:4000], file=sys.stderr)
    sys.exit(1)
