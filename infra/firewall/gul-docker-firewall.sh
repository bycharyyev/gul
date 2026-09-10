#!/bin/sh
# Restrict the container ports this host publishes to the one machine allowed to use them.
#
# Why ufw is not enough, and why believing it was is the actual bug: docker publishes a port by
# writing its own iptables rules, and packets to a published port are evaluated in the FORWARD
# path against docker's chains before ufw's filter rules ever see them. So
# `ufw allow from <secondary> to any port 5432` reads exactly like protection, appears in
# `ufw status` as a restriction, and stops nothing. Measured from a GitHub runner on 2026-09-03:
# 5432 and 6379 both answered the open internet, while 19999 -- served by a host process, not a
# container, and therefore genuinely governed by ufw -- did not.
#
# DOCKER-USER is the chain docker consults first and never rewrites, which makes it the one place
# a rule about published ports actually holds.
#
# What this does NOT do: it is not the reason the database is safe. Postgres still requires
# scram-sha-256, redis now requires a password, and pg_hba restricts by address. This closes the
# door in front of all of that, so that none of it is ever the only thing standing there.

set -e

SECONDARY="__SECONDARY_IP__"
PORTS="5432 6379"

# The interface the internet arrives on. Taken from the default route rather than hardcoded: a
# wrong interface name here would produce rules that match nothing and protect nothing, silently.
IFACE=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
if [ -z "$IFACE" ]; then
  echo "could not determine the external interface -- refusing to install rules that may match nothing" >&2
  exit 1
fi

apply() {
  cmd=$1
  for port in $PORTS; do
    # Drop any copy already present before inserting, so running this repeatedly -- which the
    # timer does -- keeps exactly one rule per port instead of a growing stack of identical ones.
    while $cmd -C DOCKER-USER -i "$IFACE" -p tcp --dport "$port" ! -s "$SECONDARY" -j DROP 2>/dev/null; do
      $cmd -D DOCKER-USER -i "$IFACE" -p tcp --dport "$port" ! -s "$SECONDARY" -j DROP
    done
    # Position 1: DOCKER-USER ends in RETURN, and a rule after that never runs.
    $cmd -I DOCKER-USER 1 -i "$IFACE" -p tcp --dport "$port" ! -s "$SECONDARY" -j DROP
    echo "  $cmd: $port open to $SECONDARY only, on $IFACE"
  done
}

apply iptables

# IPv6 only if the chain exists -- docker creates it only when ip6tables support is enabled, and
# a failure here must not leave the IPv4 rules unapplied.
if ip6tables -L DOCKER-USER -n >/dev/null 2>&1; then
  for port in $PORTS; do
    while ip6tables -C DOCKER-USER -i "$IFACE" -p tcp --dport "$port" -j DROP 2>/dev/null; do
      ip6tables -D DOCKER-USER -i "$IFACE" -p tcp --dport "$port" -j DROP
    done
    # No source exception: the secondary reaches us over IPv4, so nothing legitimate arrives here.
    ip6tables -I DOCKER-USER 1 -i "$IFACE" -p tcp --dport "$port" -j DROP
    echo "  ip6tables: $port dropped on $IFACE"
  done
else
  echo "  no IPv6 DOCKER-USER chain -- nothing to do there"
fi
