#!/bin/sh
# Writes Patroni's config from the environment and starts it. Secrets are passed to Patroni as
# PATRONI_* environment variables, never written into the YAML.
#
# Environment (from /opt/gul*/patroni.env plus -e flags, see migrate-to-patroni.yml):
#   NODE_NAME            gul-a / gul-b -- this member's name in the cluster
#   NODE_IP              this host's public address (other members and HAProxy connect to it)
#   ETCD_HOSTS           a:2379,b:2379,w:2379
#   POSTGRES_USER/PASSWORD/DB   the existing superuser and app database
#   REPLICATOR_PASSWORD  the existing `replicator` role; also guards Patroni's write API
set -eu
: "${NODE_NAME:?}" "${NODE_IP:?}" "${ETCD_HOSTS:?}"
: "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${REPLICATOR_PASSWORD:?}"

export PGDATA=/var/lib/postgresql/data
# A fresh named volume inherits the image's 1777 mode, which Postgres refuses to start on.
chmod 700 "$PGDATA" 2>/dev/null || true

export PATRONI_SUPERUSER_USERNAME="$POSTGRES_USER"
export PATRONI_SUPERUSER_PASSWORD="$POSTGRES_PASSWORD"
export PATRONI_REPLICATION_USERNAME=replicator
export PATRONI_REPLICATION_PASSWORD="$REPLICATOR_PASSWORD"
# Unsafe REST calls (switchover, config changes, restart) need these; reads and health checks
# (what HAProxy uses) do not.
export PATRONI_RESTAPI_USERNAME=patroni
export PATRONI_RESTAPI_PASSWORD="$REPLICATOR_PASSWORD"

hosts_yaml=$(echo "$ETCD_HOSTS" | tr ',' '\n' | sed 's/^/    - /')

cat > /tmp/patroni.yml <<EOF
scope: gul
name: $NODE_NAME

restapi:
  listen: 0.0.0.0:8008
  connect_address: $NODE_IP:8008

etcd3:
  hosts:
$hosts_yaml

bootstrap:
  dcs:
    ttl: 30
    loop_wait: 10
    retry_timeout: 10
    maximum_lag_on_failover: 1048576
    # A commit returns only once the other node has it too, so a failover loses nothing. Not
    # strict: with the other node down, the leader keeps accepting writes on its own.
    synchronous_mode: true
    synchronous_mode_strict: false
    postgresql:
      use_pg_rewind: true
      use_slots: true
      parameters:
        wal_level: replica
        hot_standby: "on"
        wal_log_hints: "on"
        max_wal_senders: 10
        max_replication_slots: 10
        wal_keep_size: 1GB

postgresql:
  listen: 0.0.0.0:5432
  connect_address: $NODE_IP:5432
  data_dir: $PGDATA
  bin_dir: /usr/local/bin
  pgpass: /tmp/pgpass
  use_unix_socket: true
  parameters:
    unix_socket_directories: /var/run/postgresql
  # Same posture as before Patroni: password (scram) for everything over TCP, and the host
  # firewall decides who may reach 5432 at all.
  pg_hba:
    - local all all trust
    - host replication replicator 0.0.0.0/0 scram-sha-256
    - host all all 0.0.0.0/0 scram-sha-256
EOF

exec patroni /tmp/patroni.yml
