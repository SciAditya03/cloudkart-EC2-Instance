#!/bin/bash
set -euo pipefail

APP_DIR="/opt/cloudkart"

if [[ $EUID -ne 0 ]]; then
  echo "Run this script with: sudo bash deploy/install-on-ec2.sh"
  exit 1
fi

if [[ ! -f "server.js" || ! -d "public" || ! -f "data/products.json" ]]; then
  echo "Run this script from the extracted CloudKart project directory."
  exit 1
fi

dnf install -y nodejs nginx
systemctl disable --now httpd 2>/dev/null || true

mkdir -p "$APP_DIR/data" "$APP_DIR/public"
cp -f server.js package.json "$APP_DIR/"
cp -f public/* "$APP_DIR/public/"
cp -f data/products.json "$APP_DIR/data/products.json"
touch "$APP_DIR/data/orders.json"
if ! node -e "JSON.parse(require('fs').readFileSync('$APP_DIR/data/orders.json','utf8'))" >/dev/null 2>&1; then
  echo '[]' > "$APP_DIR/data/orders.json"
fi
chown -R ec2-user:ec2-user "$APP_DIR"
chmod 755 "$APP_DIR"
chmod 755 "$APP_DIR/public"
chmod 664 "$APP_DIR/data/orders.json"

cat >/etc/systemd/system/cloudkart.service <<'UNIT'
[Unit]
Description=CloudKart Node.js e-commerce demo backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/cloudkart
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/cloudkart/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/nginx/conf.d/cloudkart.conf <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    access_log /var/log/nginx/cloudkart.access.log;
    error_log /var/log/nginx/cloudkart.error.log;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Remove the stock default server block so CloudKart owns port 80.
if [[ -f /etc/nginx/nginx.conf ]]; then
  sed -i 's/listen       80 default_server;/listen       8081;/' /etc/nginx/nginx.conf
  sed -i 's/listen       \[::\]:80 default_server;/listen [::]:8081;/' /etc/nginx/nginx.conf
fi

nginx -t
systemctl daemon-reload
systemctl enable --now cloudkart
systemctl enable --now nginx
systemctl restart cloudkart nginx

echo
echo "CloudKart deployed."
echo "Test backend: curl http://localhost:3000/api/health"
echo "Test through Nginx: curl http://localhost/api/health"
echo "Then open http://YOUR-EC2-PUBLIC-IP/ in your browser."
