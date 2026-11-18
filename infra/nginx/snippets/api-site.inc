# Shared by the api.gulyaly.com and api.gulyaly.pro vhosts (gulyaly-api.conf, gulyaly-pro.conf).
# Installed to /etc/nginx/snippets/gul/ by sync-nginx.yml; included at server level.
# Upstream gul_api is defined in gulyaly-api.conf.

# Avatar, document and feed-media uploads go through this vhost; nginx's 1MB default would
# reject them. Kept just above the application's own ceiling (60MB for feed media, see
# uploads.constants.ts) so the limit a customer meets is ours, with a message naming the size,
# rather than nginx's bare 413 page. At 20m this was BELOW the application limit, so every
# video between 20 and 60 megabytes was refused by the proxy before the API ever saw it --
# a failure that looked, from the app, exactly like publishing being broken.
client_max_body_size 64m;

# Security headers themselves come from helmet in the API (main.ts); this only stops nginx
# announcing its version (S-13), and a second copy of X-Powered-By if one ever appears.
server_tokens off;
proxy_hide_header X-Powered-By;

# Swagger UI and the raw spec map every route, admin ones included (S-04). The API no longer
# mounts them in production; refusing them here as well keeps them closed even if someone
# sets API_DOCS_PUBLIC=true on the server by mistake. Staff read the spec through
# /api/admin/stats/openapi.
location ~ ^/(docs|docs-json|docs-yaml)(/|$) {
    return 404;
}

location ^~ /api/payments/webhooks/ {
    client_max_body_size 256k;
    proxy_pass http://gul_api;
    proxy_http_version 1.1;
    # Empty Connection header: required for the upstream keepalive pool to reuse connections.
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Public reads whose answer is the same for everybody: the operator catalogue, the CMS pages
# (legal text, the mobile welcome screen), the home slides, stories and social links. None of
# them depend on who is asking, and all of them are asked for on nearly every visit.
#
# This is an explicit allowlist and must stay one. The failure mode of caching too much here
# is not a stale price -- it is one customer being handed another customer's orders, and a
# "cache everything except..." rule gets that wrong the first time somebody adds an endpoint
# and forgets the exception. A rule that only ever caches named paths fails the other way:
# something goes uncached, and nobody is harmed.
location ~ ^/api/(catalog|content-pages|home-slides|stories|social-links)(/|$) {
    proxy_pass http://gul_api;
    proxy_http_version 1.1;
    # Empty Connection header: required for the upstream keepalive pool to reuse connections.
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_cache gul_api;
    proxy_cache_valid 200 60s;

    # Belt and braces on top of the allowlist: never read from or write to the cache for a
    # request that carries credentials. If one of these paths ever grows a per-user variant,
    # the authenticated call goes straight to the API instead of being answered from, or
    # poisoning, the shared copy. (nginx already refuses to store a response with Set-Cookie.)
    proxy_cache_bypass $http_authorization;
    proxy_no_cache $http_authorization;

    # One request refreshes an expired entry while everyone else keeps reading the old one,
    # and a stale copy is served if the API is unwell. That turns an API restart -- or the
    # kind of half-hour the primary had on 2026-09-02 -- from an error page into slightly
    # out-of-date content.
    proxy_cache_lock on;
    proxy_cache_background_update on;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;

    add_header X-Cache $upstream_cache_status always;
}

location / {
    proxy_pass http://gul_api;
    proxy_http_version 1.1;
    # Empty Connection header: required for the upstream keepalive pool to reuse connections.
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
