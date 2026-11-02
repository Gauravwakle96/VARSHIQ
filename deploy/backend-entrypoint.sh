#!/bin/sh
set -eu
python -m alembic upgrade head
# The initial pilot uses one process: rate-limit counters and refresh scheduling are process-local.
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-access-log --timeout-keep-alive 5
