#!/bin/bash
# ============================================================================
# Keepalived FAULT State Notification
# ============================================================================
# Description: Called when gateway enters FAULT state (critical)
# ============================================================================

TYPE=$1
NAME=$2
STATE=$3

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
HOSTNAME=$(hostname)
IP=$(ip addr show | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | cut -d/ -f1)

# Log to syslog
logger -t keepalived-fault "CRITICAL: Gateway $HOSTNAME ($IP) entered FAULT state"

# Log to file
echo "[$TIMESTAMP] FAULT: $HOSTNAME ($IP) - State: $STATE - CRITICAL" >> /var/log/keepalived-state.log

# Send CRITICAL alert to monitoring
# curl -X POST https://monitoring.insightserenity.com/api/alerts \
#   -H "Content-Type: application/json" \
#   -d "{\"severity\":\"critical\",\"event\":\"keepalived_fault\",\"hostname\":\"$HOSTNAME\",\"ip\":\"$IP\",\"timestamp\":\"$TIMESTAMP\"}"

# Send alert to PagerDuty (PRODUCTION ONLY)
# curl -X POST https://events.pagerduty.com/v2/enqueue \
#   -H "Content-Type: application/json" \
#   -d "{
#     \"routing_key\": \"YOUR_PAGERDUTY_KEY\",
#     \"event_action\": \"trigger\",
#     \"payload\": {
#       \"summary\": \"Gateway $HOSTNAME in FAULT state\",
#       \"severity\": \"critical\",
#       \"source\": \"$HOSTNAME\",
#       \"custom_details\": {
#         \"state\": \"$STATE\",
#         \"ip\": \"$IP\",
#         \"timestamp\": \"$TIMESTAMP\"
#       }
#     }
#   }"

# Attempt to restart NGINX
logger -t keepalived-fault "Attempting to restart NGINX"
systemctl restart nginx

# Check if restart was successful
sleep 2
if pidof nginx > /dev/null; then
    logger -t keepalived-fault "NGINX restart successful"
else
    logger -t keepalived-fault "NGINX restart FAILED - manual intervention required"
fi

exit 0
