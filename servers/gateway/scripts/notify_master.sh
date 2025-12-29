#!/bin/bash
# ============================================================================
# Keepalived MASTER State Notification
# ============================================================================
# Description: Called when gateway becomes MASTER (active)
# ============================================================================

TYPE=$1
NAME=$2
STATE=$3

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
HOSTNAME=$(hostname)
IP=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

# Log to syslog
logger -t keepalived-master "Gateway $HOSTNAME ($IP) transitioned to MASTER state"

# Log to file
echo "[$TIMESTAMP] MASTER: $HOSTNAME ($IP) - State: $STATE" >> /var/log/keepalived-state.log

# Send notification to monitoring system (optional)
# curl -X POST https://monitoring.insightserenity.com/api/events \
#   -H "Content-Type: application/json" \
#   -d "{\"event\":\"keepalived_master\",\"hostname\":\"$HOSTNAME\",\"ip\":\"$IP\",\"timestamp\":\"$TIMESTAMP\"}"

# Send alert to PagerDuty/Slack (optional - only for production)
# if [ "$STATE" = "MASTER" ]; then
#     curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
#       -H "Content-Type: application/json" \
#       -d "{\"text\":\"🚨 Gateway $HOSTNAME is now MASTER (Active)\"}"
# fi

# Update DNS if using dynamic DNS (optional)
# /usr/local/bin/update-dns.sh

# Ensure NGINX is running
if ! pidof nginx > /dev/null; then
    logger -t keepalived-master "NGINX not running, attempting to start"
    systemctl start nginx
fi

# Send gratuitous ARP to update network
arping -c 3 -A -I eth0 $(cat /etc/keepalived/keepalived.conf | grep virtual_ipaddress -A 1 | tail -1 | awk '{print $1}') || true

exit 0
