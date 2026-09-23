#!/usr/bin/env bash
# Read-only. What the *secondary* can tell us about the primary going away, when the primary
# itself cannot be reached to be asked.
#
# Three witnesses live on this box and none of them require the dead machine to answer:
#
#  * the streaming replica, which was connected to the primary's Postgres and logs the exact
#    second it lost it -- a far better time of death than "the deploy failed at 19:18";
#  * the Postfix relay, through which the primary sends its own disk alerts, so a warning it
#    managed to send on the way down is sitting in this machine's mail log;
#  * the network, from a host on the same provider, which distinguishes "the internet cannot
#    route to it" from "it accepts connections and then says nothing".
#
# Run against the secondary. Prints no credentials.

echo "############ NOW ############"
date -u '+%Y-%m-%d %H:%M:%S UTC'
echo

echo "############ TIME OF DEATH, PER THE REPLICA ############"
# The replica reconnects on a loop, so the boundary between the last successful stream and the
# first refusal is the moment the primary stopped answering on 5432.
docker logs pg-standby --since 6h 2>&1 \
  | grep -aiE "started streaming|FATAL|terminating|could not connect|entering standby" \
  | tail -25
echo
echo "--- how far the replica got before it lost contact ---"
docker exec pg-standby pg_controldata /var/lib/postgresql/data 2>&1 \
  | grep -iE "cluster state|REDO location|Time of latest checkpoint"
echo

echo "############ DID THE PRIMARY SEND AN ALERT ON THE WAY DOWN ############"
# gul-disk-alert.sh mails through this relay when the root disk crosses 80%. If the primary
# filled its disk, the warning came through here -- and the message body is in the log's subject
# line. Nothing is sent for memory exhaustion, which is worth knowing when nothing shows up.
sudo -n grep -aiE "alert|disk" /var/log/mail.log 2>/dev/null | tail -30 \
  || grep -aiE "alert|disk" /var/log/mail.log 2>/dev/null | tail -30 \
  || echo "mail.log needs privileges this user does not have"
echo
echo "--- everything this relay handled recently, alert or not ---"
(sudo -n tail -40 /var/log/mail.log 2>/dev/null || tail -40 /var/log/mail.log 2>/dev/null) \
  || echo "mail.log unreadable"
echo

echo "############ WHAT THIS HOST SEES OF THE PRIMARY RIGHT NOW ############"
PRIMARY=$(grep -oE "@[0-9.]+:5432" /opt/gul-secondary/.env 2>/dev/null | head -1 | tr -d '@' | cut -d: -f1)
if [ -z "$PRIMARY" ]; then
  echo "could not read the primary's address out of /opt/gul-secondary/.env"
else
  echo "--- ICMP (does the kernel answer) ---"
  ping -c 3 -W 2 "$PRIMARY" 2>&1 | tail -3
  echo "--- TCP (does anything accept, and then speak) ---"
  # A refused connection means the machine is up and the service is gone. A timeout after the
  # handshake means the service is there and cannot get scheduled. They call for opposite fixes.
  for port in 22 80 443 5432; do
    timeout 6 bash -c "cat < /dev/null > /dev/tcp/$PRIMARY/$port" 2>/dev/null \
      && echo "  $port: connected" \
      || echo "  $port: no connection within 6s"
  done
  echo "--- ssh far enough to get a banner? ---"
  timeout 10 ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=no -o BatchMode=yes \
    "deploy@$PRIMARY" true 2>&1 | tail -2
fi
echo

echo "############ THIS HOST'S OWN HEALTH (is it about to go the same way) ############"
uptime
free -h
df -h /
echo "--- anything the kernel killed here ---"
(dmesg -T 2>/dev/null || sudo -n dmesg -T 2>/dev/null) | grep -aiE "out of memory|oom-kill|killed process" | tail -5 \
  || echo "no OOM kills in this host's ring buffer (or dmesg needs privileges)"
