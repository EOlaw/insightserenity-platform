#!/bin/bash
# ============================================================================
# Keepalived BACKUP State Notification
# ============================================================================
# Description: Called when gateway becomes BACKUP (standby)
# ============================================================================

TYPE=$1
NAME=$2
STATE=$3

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
HOSTNAME=$(hostname)
IP=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

# Log to syslog
logger -t keepalived-backup "Gateway $HOSTNAME ($IP) transitioned to BACKUP state"

# Log to file
echo "[$TIMESTAMP] BACKUP: $HOSTNAME ($IP) - State: $STATE" >> /var/log/keepalived-state.log

# Send notification to monitoring system (optional)
# curl -X POST https://monitoring.insightserenity.com/api/events \
#   -H "Content-Type: application/json" \
#   -d "{\"event\":\"keepalived_backup\",\"hostname\":\"$HOSTNAME\",\"ip\":\"$IP\",\"timestamp\":\"$TIMESTAMP\"}"

# Ensure NGINX is still running (for health checks)
if ! pidof nginx > /dev/null; then
    logger -t keepalived-backup "NGINX not running on BACKUP, attempting to start"
    systemctl start nginx
fi

exit 0
