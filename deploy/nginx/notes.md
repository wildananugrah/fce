### how to deploy

1. setup DNS record in cloudflare

2. create certification using

```bash
certbot certonly --nginx -d fce.floothink.com
certbot certonly --nginx -d fce-api.floothink.com
certbot certonly --nginx -d fce-monit.floothink.com
certbot certonly --nginx -d code.floothink.com
```

3. copy nginx config

```bash
cp nginx/fce.floothink.com /etc/nginx/sites-available/fce.floothink.com
cp nginx/fce-api.floothink.com /etc/nginx/sites-available/fce-api.floothink.com
cp nginx/fce-monit.floothink.com /etc/nginx/sites-available/fce-monit.floothink.com
```

4. link it

```bash
ln -s /etc/nginx/sites-available/fce.floothink.com /etc/nginx/sites-enabled/fce.floothink.com
ln -s /etc/nginx/sites-available/fce-api.floothink.com /etc/nginx/sites-enabled/fce-api.floothink.com
ln -s /etc/nginx/sites-available/fce-monit.floothink.com /etc/nginx/sites-enabled/fce-monit.floothink.com
ln -s /etc/nginx/sites-available/code.floothink.com /etc/nginx/sites-enabled/code.floothink.com
```

5. check the nginx config

```bash
nginx -t;
```

6. restart nginx

```bash
systemctl reload nginx; systemctl restart nginx; systemctl status nginx;
```
