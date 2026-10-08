# Postgres + Patroni, one container per database node (container name gul-pg, host networking).
#
# Built FROM the exact image the database already ran on (postgres:16-alpine) on purpose: text
# indexes are ordered by the C library's collation rules, and moving the same data directory to a
# glibc-based image would silently reorder them. Same image family, same musl, same indexes.
FROM postgres:16-alpine

# Patroni from PyPI; the compiled pieces (psycopg2, psutil, yaml) from Alpine so nothing is built
# against musl here.
RUN apk add --no-cache python3 py3-pip py3-psycopg2 py3-psutil py3-yaml curl openssl \
 && pip install --no-cache-dir --break-system-packages 'patroni[etcd3]>=4.0,<4.1' \
 && patroni --version

COPY entrypoint.sh /usr/local/bin/gul-patroni
# WAL archive + daily base backup to S3, encrypted to the same public certificate as the hourly
# dumps (its private key is only on the owner's PC); build-patroni-image.yml copies that
# certificate from infra/backups/ into this build context first.
COPY s3.sh /usr/local/lib/gul/s3.sh
COPY wal-archive.sh /usr/local/bin/gul-wal-archive
COPY base-backup.sh /usr/local/bin/gul-base-backup
COPY backup-recipient.pem /etc/gul/backup-recipient.pem
RUN chmod 755 /usr/local/bin/gul-patroni /usr/local/bin/gul-wal-archive /usr/local/bin/gul-base-backup

USER postgres
ENTRYPOINT ["/usr/local/bin/gul-patroni"]
