#!/bin/bash
# ============================================================================
# User Data Script for Gateway Instance Initialization
# ============================================================================

set -e

# Variables from Terraform
HOSTNAME="${hostname}"
ENVIRONMENT="${environment}"
IS_MASTER="${is_master}"
VIRTUAL_IP="${virtual_ip}"

# Set hostname
hostnamectl set-hostname "$HOSTNAME"
echo "127.0.0.1 $HOSTNAME" >> /etc/hosts

# Update system
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y \
    nginx \
    keepalived \
    curl \
    wget \
    git \
    htop \
    net-tools \
    certbot \
    python3-certbot-nginx \
    prometheus-node-exporter

# Install nginx-prometheus-exporter
EXPORTER_VERSION="0.11.0"
wget "https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v${EXPORTER_VERSION}/nginx-prometheus-exporter_${EXPORTER_VERSION}_linux_amd64.tar.gz"
tar xzf "nginx-prometheus-exporter_${EXPORTER_VERSION}_linux_amd64.tar.gz"
mv nginx-prometheus-exporter /usr/local/bin/
rm "nginx-prometheus-exporter_${EXPORTER_VERSION}_linux_amd64.tar.gz"

# Create systemd service for nginx-prometheus-exporter
cat > /etc/systemd/system/nginx-prometheus-exporter.service <<EOF
[Unit]
Description=NGINX Prometheus Exporter
After=network.target

[Service]
Type=simple
User=nginx
ExecStart=/usr/local/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://localhost/nginx_status
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
systemctl daemon-reload
systemctl enable nginx
systemctl enable keepalived
systemctl enable prometheus-node-exporter
systemctl enable nginx-prometheus-exporter

systemctl start prometheus-node-exporter
systemctl start nginx-prometheus-exporter

# Mark as initialized
echo "Gateway initialized at $(date)" > /var/log/gateway-init.log
