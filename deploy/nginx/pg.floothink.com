server {
  listen 443 ssl;
  listen [::]:443 ssl;
  ssl_certificate /etc/letsencrypt/live/pg.floothink.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pg.floothink.com/privkey.pem;
  client_max_body_size 1024M;
  server_name pg.floothink.com;

  # Security Headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # Gzip Compression
  gzip on;
  gzip_vary on;
  gzip_min_length 256;
  gzip_proxied any;
  gzip_comp_level 6;
  gzip_types application/json text/plain application/javascript;

  # pgAdmin (dpage/pgadmin4 container, published on 127.0.0.1:5050)
  location / {
      proxy_pass http://127.0.0.1:5050/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # WebSocket upgrade for pgAdmin's Query Tool
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";

      # Long queries and large exports — bump past the default 60s.
      proxy_connect_timeout 60s;
      proxy_send_timeout 600s;
      proxy_read_timeout 600s;

      # Streaming query results render faster without buffering.
      proxy_buffering off;
  }
}

server {
    if ($host = pg.floothink.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80 ;
    listen [::]:80 ;
    server_name pg.floothink.com;
    return 404; # managed by Certbot
}
