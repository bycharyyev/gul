# Postgres + Patroni, one container per database node (container name gul-pg, host networking).
#
# Built FROM the exact image the database already ran on (postgres:16-alpine) on purpose: text
# indexes are ordered by the C library's collation rules, and moving the same data directory to a
# glibc-based image would silently reorder them. Same image family, same musl, same indexes.
FROM postgres:16-alpine

# Patroni from PyPI; the compiled pieces (psycopg2, psutil, yaml) from Alpine so nothing is built
# against musl here.
RUN apk add --no-cache python3 py3-pip py3-psycopg2 py3-psutil py3-yaml curl \
 && pip install --no-cache-dir --break-system-packages 'patroni[etcd3]>=4.0,<4.1' \
 && patroni --version

COPY entrypoint.sh /usr/local/bin/gul-patroni
RUN chmod 755 /usr/local/bin/gul-patroni

USER postgres
ENTRYPOINT ["/usr/local/bin/gul-patroni"]
