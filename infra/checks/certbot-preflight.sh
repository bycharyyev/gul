#!/usr/bin/env bash
# Read-only. Is this host ready for gul-cert-sync.timer to be installed on it?
#
# sync-ssl-domains.sh assumes `certbot --nginx` already works -- it does not install anything
# itself. Answering that first avoids installing a timer whose every run fails quietly in the
# background.

echo "host: $(hostname)"
echo -n "certbot binary: "; command -v certbot || echo "MISSING"
echo -n "nginx plugin (python3-certbot-nginx): "
dpkg -l python3-certbot-nginx 2>/dev/null | grep -q '^ii' && echo "installed" || echo "MISSING"
echo
echo "--- current cert and its SANs ---"
echo | timeout 8 openssl s_client -connect 127.0.0.1:443 -servername gulyaly.pro 2>/dev/null \
  | openssl x509 -noout -subject -enddate -ext subjectAltName 2>/dev/null
echo
echo "--- server_name entries the script would expand to (its own domain scan) ---"
grep -rhoP '(?<=server_name\s)[^;]+' /etc/nginx/sites-enabled/*.conf 2>/dev/null \
  | tr ' ' '\n' | grep -v '^_$' | grep -v '^localhost$' | grep -v '^\s*$' | sort -u
