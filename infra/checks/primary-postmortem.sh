#!/usr/bin/env bash
# Why did this machine stop answering between 19:02 and 19:34 UTC on 2026-09-02?
#
# Reads only. It does start one throwaway privileged container to reach root-only logs -- dmesg is
# restricted on Ubuntu and the journal is not readable by the deploy user -- which is the same
# docker-chroot pattern the ops workflows already use. It writes nothing and installs nothing.
#
# **This host runs on CEST (UTC+2), the secondary on MSK (UTC+3), and every timestamp gathered
# from outside is UTC.** journalctl --since takes host local time, so the outage window has to be
# asked for as 21:02-21:34, not 19:02-19:34. Getting that wrong the first time returned a
# perfectly healthy two-hours-earlier and made the machine look fine throughout.
OUTAGE_FROM="2026-09-02 20:55"   # host local (CEST) == 18:55 UTC
OUTAGE_TO="2026-09-02 21:45"     # host local (CEST) == 19:45 UTC

read_root() {
  docker run --rm --pid=host --privileged -v /:/host alpine \
    chroot /host /bin/sh -c "$1" 2>&1
}

echo "############ CLOCK, SO EVERY TIMESTAMP BELOW CAN BE READ ############"
date '+host local: %Y-%m-%d %H:%M:%S %Z'
date -u '+UTC:        %Y-%m-%d %H:%M:%S'
uptime
echo

echo "############ DID IT REBOOT, AND WHEN ############"
read_root "journalctl --list-boots --no-pager 2>/dev/null | tail -5"
echo "--- reboot records ---"
read_root "last -x --time-format iso reboot shutdown 2>/dev/null | head -6"
echo

echo "############ THE OUTAGE WINDOW, PREVIOUS BOOT ############"
# -b -1 is the boot that died. Without it journalctl shows the current one, which by definition
# has nothing to say about a period before it existed.
read_root "journalctl -b -1 --since '$OUTAGE_FROM' --until '$OUTAGE_TO' --no-pager -p warning 2>/dev/null | grep -avE 'UFW BLOCK' | tail -60"
echo
echo "--- the last thing the dying boot logged at all ---"
read_root "journalctl -b -1 --no-pager 2>/dev/null | grep -avE 'UFW BLOCK' | tail -25"
echo

echo "############ THE USUAL SUSPECTS, ACROSS THE WHOLE DYING BOOT ############"
# A machine that keeps logging while refusing every inbound TCP connection is not frozen. These
# are the things that produce exactly that: a full connection-tracking table, a SYN flood, a
# listen backlog overflowing, or the OOM killer taking sshd and nginx.
read_root "journalctl -b -1 --no-pager 2>/dev/null | grep -aiE -B3 -A6 'conntrack table full|possible SYN flooding|out of memory|oom-kill|killed process|blocked for more than|hung_task|kernel BUG|Oops|general protection|I/O error|EXT4-fs error|watchdog: BUG' | grep -avE 'Modules linked in|^--$' | cut -c1-200 | tail -60"
echo

echo "############ FIREWALL ############"
# --network=host is not optional here. --pid=host puts the container in the host'"'"'s process
# namespace but NOT its network namespace, so ufw and iptables read the throwaway container'"'"'s
# own empty stack and report "Status: inactive" no matter what the host is actually doing. This
# is written down in CLAUDE.md and it still caught this script out once.
docker run --rm --pid=host --network=host --privileged -v /:/host alpine   chroot /host /bin/sh -c "ufw status verbose 2>&1 | head -20; echo; echo '--- enabled at boot? ---'; systemctl is-enabled ufw 2>&1; systemctl is-active ufw 2>&1" 2>&1
echo

echo "############ SCAN PRESSURE ON THE DYING BOOT ############"
# The blocked-packet log is normally background noise. A sudden change in its rate is not.
read_root "journalctl -b -1 --since '$OUTAGE_FROM' --until '$OUTAGE_TO' --no-pager 2>/dev/null | grep -ac 'UFW BLOCK'"
echo "blocked packets in the 50 minutes around the outage (above), versus a quiet hour:"
read_root "journalctl -b -1 --since '2026-09-02 19:00' --until '2026-09-02 19:50' --no-pager 2>/dev/null | grep -ac 'UFW BLOCK'"
echo

echo "############ STATE NOW ############"
free -h
df -h / 2>/dev/null
echo "--- connection tracking headroom ---"
read_root "cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null; cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null"
echo "--- containers ---"
docker ps --format "{{.Names}}\t{{.Status}}"
echo "--- api ---"
curl -fsS -m 5 http://127.0.0.1:4000/api/health/ready 2>&1 | head -c 120
echo
echo "--- deployed image tag (the failed deploy never applied one) ---"
grep -E "^IMAGE_TAG=" /opt/gul/.env 2>/dev/null || echo "IMAGE_TAG not set"
