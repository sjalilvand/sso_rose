"""Start a user-space PostgreSQL via pgserver and print the SQLAlchemy URL."""
import pgserver

uri = pgserver.get_server("/tmp/rosepsy-pgdata")
uri = str(uri.get_uri()) if hasattr(uri, "get_uri") else str(uri)
print("PGSERVER_URI=" + uri)

import psycopg

# uri مثل postgresql://postgres@127.0.0.1:PORT/postgres?... است
base = uri.split("?")[0]
with psycopg.connect(base + "?dbname=postgres") as conn, conn.cursor() as cur:
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname='postgres'")
    if cur.fetchone() is None:
        cur.execute("CREATE ROLE postgres LOGIN SUPERUSER")
    conn.commit()
print("READY")
