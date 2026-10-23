#!/bin/bash
# EC2 User data script - Amazon Linux 2023, t3.micro
# Paste this into "Advanced details > User data" when launching the instance.
# It installs Node.js + Nginx, pulls the CloudKart app, and starts everything on port 80.
set -xe

APP_DIR=/opt/cloudkart
REPO_URL="${REPO_URL:-https://github.com/REPLACE_ME/cloudkart.git}"

dnf update -y
dnf install -y nodejs git nginx

# --- application code -------------------------------------------------
if [ ! -d "$APP_DIR" ]; then
  git clone "$REPO_URL" "$APP_DIR" || mkdir -p "$APP_DIR"
fi
chown -R ec2-user:ec2-user "$APP_DIR"

# --- run the Node backend as a systemd service ------------------------
cat >/etc/systemd/system/cloudkart.service <<'UNIT'
[Unit]
Description=CloudKart Node.js backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/cloudkart
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/cloudkart/server.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

# --- Nginx reverse proxy: port 80 -> Node on 3000 ---------------------
cat >/etc/nginx/conf.d/cloudkart.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    access_log /var/log/nginx/cloudkart.access.log;
    error_log  /var/log/nginx/cloudkart.error.log;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Amazon Linux ships a default server block on 80; drop it so ours wins.
sed -i 's/listen       80 default_server;/listen       8081;/'        /etc/nginx/nginx.conf || true
sed -i 's/listen       \[::\]:80 default_server;/listen [::]:8081;/'  /etc/nginx/nginx.conf || true

nginx -t
systemctl daemon-reload
systemctl enable --now cloudkart
systemctl enable --now nginx
systemctl restart nginx

echo "CloudKart deployed. Open http://<EC2 public IP>/"
