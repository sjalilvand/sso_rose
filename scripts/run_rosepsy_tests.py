"""اجرای تست‌های رز سای روی PostgreSQL کاربر-محل (pgserver)."""
import os
import sys

import pgserver

srv = pgserver.get_server("/tmp/rosepsy-pgdata")
uri = str(srv.get_uri()).replace("postgresql://", "postgresql+psycopg://", 1)
os.environ["DATABASE_URL"] = uri
print("DATABASE_URL=" + uri, flush=True)

import pytest  # noqa: E402

sys.exit(pytest.main(sys.argv[1:]))
