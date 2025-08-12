#!/bin/bash

# ============================================================================
# InsightSerenity Platform - Service Orchestration Script
# ============================================================================
# This script manages the startup and shutdown of all platform services
# including the API Gateway, Admin Server, and Customer Services.
#
# Usage:
#   ./start-services.sh [environment] [options]
#
# Examples:
#   ./start-services.sh development
#   ./start-services.sh production --skip-health-check
#   ./start-services.sh staging --gateway-only
#
# Author: InsightSerenity Platform Team
# Version: 1.0.0
# ============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failure

# ============================================================================
# Configuration and Variables
# ============================================================================

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly PID_DIR="${PROJECT_ROOT}/pids"
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Service configuration
readonly GATEWAY_PORT="${GATEWAY_PORT:-3000}"
readonly ADMIN_PORT="${ADMIN_PORT:-4001}"
readonly CUSTOMER_PORT="${CUSTOMER_PORT:-4002}"
readonly MONITORING_PORT="${MONITORING_PORT:-9090}"

# Default environment
ENVIRONMENT="${1:-development}"
shift || true

# Service URLs
readonly GATEWAY_URL="http://localhost:${GATEWAY_PORT}"
readonly ADMIN_URL="http://localhost:${ADMIN_PORT}"
readonly CUSTOMER_URL="http://localhost:${CUSTOMER_PORT}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# Service PIDs
GATEWAY_PID=""
ADMIN_PID=""
CUSTOMER_PID=""

# Flags
SKIP_HEALTH_CHECK=false
GATEWAY_ONLY=false
VERBOSE=false
DRY_RUN=false

# ============================================================================
# Helper Functions
# ============================================================================

# Print colored output
print_color() {
    local color=$1
    shift
    echo -e "${color}$*${NC}"
}

# Print information message
info() {
    print_color "${BLUE}" "[INFO] $*"
}

# Print success message
success() {
    print_color "${GREEN}" "[SUCCESS] $*"
}

# Print warning message
warning() {
    print_color "${YELLOW}" "[WARNING] $*"
}

# Print error message
error() {
    print_color "${RED}" "[ERROR] $*"
}

# Print debug message (only if verbose)
debug() {
    if [[ "$VERBOSE" == true ]]; then
        print_color "${CYAN}" "[DEBUG] $*"
    fi
}

# Print section header
print_header() {
    echo ""
    print_color "${MAGENTA}" "============================================================"
    print_color "${MAGENTA}" " $*"
    print_color "${MAGENTA}" "============================================================"
    echo ""
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Create necessary directories
create_directories() {
    info "Creating necessary directories..."
    mkdir -p "$LOG_DIR"
    mkdir -p "$PID_DIR"
    mkdir -p "$LOG_DIR/gateway"
    mkdir -p "$LOG_DIR/admin"
    mkdir -p "$LOG_DIR/customer"
    success "Directories created"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    local missing_deps=()

    # Check Node.js
    if ! command_exists node; then
        missing_deps+=("Node.js")
    else
        local node_version=$(node --version | cut -d'v' -f2)
        info "Node.js version: v${node_version}"
        
        # Check minimum version (18.0.0)
        if [[ "$(printf '%s\n' "18.0.0" "${node_version}" | sort -V | head -n1)" != "18.0.0" ]]; then
            error "Node.js version must be >= 18.0.0"
            exit 1
        fi
    fi

    # Check npm
    if ! command_exists npm; then
        missing_deps+=("npm")
    else
        local npm_version=$(npm --version)
        info "npm version: ${npm_version}"
    fi

    # Check Redis (optional but recommended)
    if command_exists redis-cli; then
        info "Redis detected"
    else
        warning "Redis not detected - some features may be limited"
    fi

    # Check MongoDB (optional but recommended)
    if command_exists mongod; then
        info "MongoDB detected"
    else
        warning "MongoDB not detected - database features will be limited"
    fi

    # Check for missing dependencies
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error "Missing required dependencies: ${missing_deps[*]}"
        error "Please install missing dependencies and try again"
        exit 1
    fi

    success "All prerequisites met"
}

# Load environment variables
load_environment() {
    print_header "Loading Environment: ${ENVIRONMENT}"

    # Load base .env file if exists
    if [[ -f "${PROJECT_ROOT}/.env" ]]; then
        debug "Loading base .env file"
        export $(grep -v '^#' "${PROJECT_ROOT}/.env" | xargs)
    fi

    # Load environment-specific .env file
    local env_file="${PROJECT_ROOT}/.env.${ENVIRONMENT}"
    if [[ -f "$env_file" ]]; then
        info "Loading environment file: ${env_file}"
        export $(grep -v '^#' "$env_file" | xargs)
    else
        warning "Environment file not found: ${env_file}"
        warning "Using default configuration"
    fi

    # Set NODE_ENV
    export NODE_ENV="${ENVIRONMENT}"
    
    # Set service URLs for gateway
    export ADMIN_SERVER_URL="${ADMIN_URL}"
    export CUSTOMER_SERVICES_URL="${CUSTOMER_URL}"

    success "Environment loaded: ${ENVIRONMENT}"
}

# Install dependencies for a service
install_dependencies() {
    local service_path=$1
    local service_name=$2

    if [[ ! -d "${service_path}/node_modules" ]]; then
        info "Installing dependencies for ${service_name}..."
        cd "$service_path"
        npm install --silent
        cd - > /dev/null
        success "Dependencies installed for ${service_name}"
    else
        debug "Dependencies already installed for ${service_name}"
    fi
}

# Start a service
start_service() {
    local service_path=$1
    local service_name=$2
    local service_port=$3
    local pid_file="${PID_DIR}/${service_name}.pid"
    local log_file="${LOG_DIR}/${service_name}/${service_name}_${TIMESTAMP}.log"

    info "Starting ${service_name} on port ${service_port}..."

    # Check if service is already running
    if [[ -f "$pid_file" ]]; then
        local existing_pid=$(cat "$pid_file")
        if ps -p "$existing_pid" > /dev/null 2>&1; then
            warning "${service_name} is already running with PID ${existing_pid}"
            return 0
        else
            debug "Removing stale PID file for ${service_name}"
            rm -f "$pid_file"
        fi
    fi

    # Install dependencies if needed
    install_dependencies "$service_path" "$service_name"

    # Start the service
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would start ${service_name}"
        return 0
    fi

    cd "$service_path"
    PORT="${service_port}" nohup node server.js >> "$log_file" 2>&1 &
    local pid=$!
    cd - > /dev/null

    # Save PID
    echo "$pid" > "$pid_file"

    # Wait for service to be ready
    sleep 2

    # Verify service started
    if ps -p "$pid" > /dev/null 2>&1; then
        success "${service_name} started with PID ${pid}"
        eval "${service_name}_PID=${pid}"
    else
        error "Failed to start ${service_name}"
        tail -n 20 "$log_file"
        return 1
    fi
}

# Check service health
check_health() {
    local service_url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=0

    info "Checking health of ${service_name}..."

    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "${service_url}/health" > /dev/null 2>&1; then
            success "${service_name} is healthy"
            return 0
        fi
        
        attempt=$((attempt + 1))
        debug "Health check attempt ${attempt}/${max_attempts} for ${service_name}"
        sleep 2
    done

    error "${service_name} health check failed after ${max_attempts} attempts"
    return 1
}

# Start all services
start_all_services() {
    print_header "Starting InsightSerenity Platform Services"

    # Start backend services first (unless gateway-only mode)
    if [[ "$GATEWAY_ONLY" == false ]]; then
        # Start Admin Server
        start_service \
            "${PROJECT_ROOT}/servers/admin-server" \
            "admin" \
            "$ADMIN_PORT"

        # Start Customer Services
        start_service \
            "${PROJECT_ROOT}/servers/customer-services" \
            "customer" \
            "$CUSTOMER_PORT"

        # Wait for backend services to be ready
        if [[ "$SKIP_HEALTH_CHECK" == false ]]; then
            check_health "$ADMIN_URL" "Admin Server"
            check_health "$CUSTOMER_URL" "Customer Services"
        else
            info "Skipping health checks (--skip-health-check flag)"
            sleep 5  # Give services time to start
        fi
    fi

    # Start API Gateway
    start_service \
        "${PROJECT_ROOT}/servers/gateway" \
        "gateway" \
        "$GATEWAY_PORT"

    # Check gateway health
    if [[ "$SKIP_HEALTH_CHECK" == false ]]; then
        check_health "$GATEWAY_URL" "API Gateway"
    fi

    print_service_info
}

# Print service information
print_service_info() {
    print_header "Services Started Successfully!"

    echo ""
    print_color "${WHITE}" "Service URLs:"
    print_color "${CYAN}" "  API Gateway:        ${GATEWAY_URL}"
    
    if [[ "$GATEWAY_ONLY" == false ]]; then
        print_color "${CYAN}" "  Admin Server:       ${ADMIN_URL} (Direct Access)"
        print_color "${CYAN}" "  Customer Services:  ${CUSTOMER_URL} (Direct Access)"
    fi
    
    echo ""
    print_color "${WHITE}" "Gateway Routes:"
    print_color "${GREEN}" "  Admin API:     ${GATEWAY_URL}/api/admin/*"
    print_color "${GREEN}" "  Customer API:  ${GATEWAY_URL}/api/services/*"
    print_color "${GREEN}" "  Health Check:  ${GATEWAY_URL}/health"
    print_color "${GREEN}" "  Metrics:       ${GATEWAY_URL}/metrics"
    print_color "${GREEN}" "  API Docs:      ${GATEWAY_URL}/api-docs"
    
    echo ""
    print_color "${WHITE}" "Monitoring:"
    print_color "${YELLOW}" "  Logs:          ${LOG_DIR}/"
    print_color "${YELLOW}" "  PID Files:     ${PID_DIR}/"
    
    echo ""
    print_color "${WHITE}" "Commands:"
    print_color "${MAGENTA}" "  Stop all:      ${SCRIPT_DIR}/stop-services.sh"
    print_color "${MAGENTA}" "  View logs:     tail -f ${LOG_DIR}/gateway/gateway_*.log"
    print_color "${MAGENTA}" "  Status:        ${SCRIPT_DIR}/service-status.sh"
    
    echo ""
    info "All services are running. Press Ctrl+C to stop all services."
}

# Stop a service
stop_service() {
    local pid_file=$1
    local service_name=$2

    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        
        if ps -p "$pid" > /dev/null 2>&1; then
            info "Stopping ${service_name} (PID: ${pid})..."
            kill -SIGTERM "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local count=0
            while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 10 ]]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if ps -p "$pid" > /dev/null 2>&1; then
                warning "Force killing ${service_name}"
                kill -SIGKILL "$pid" 2>/dev/null || true
            fi
            
            success "${service_name} stopped"
        else
            debug "${service_name} not running (stale PID file)"
        fi
        
        rm -f "$pid_file"
    else
        debug "${service_name} PID file not found"
    fi
}

# Stop all services
stop_all_services() {
    print_header "Stopping InsightSerenity Platform Services"

    # Stop services in reverse order
    stop_service "${PID_DIR}/gateway.pid" "API Gateway"
    
    if [[ "$GATEWAY_ONLY" == false ]]; then
        stop_service "${PID_DIR}/customer.pid" "Customer Services"
        stop_service "${PID_DIR}/admin.pid" "Admin Server"
    fi

    success "All services stopped"
}

# Signal handler for graceful shutdown
signal_handler() {
    echo ""  # New line after Ctrl+C
    warning "Received shutdown signal"
    stop_all_services
    exit 0
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-health-check)
                SKIP_HEALTH_CHECK=true
                shift
                ;;
            --gateway-only)
                GATEWAY_ONLY=true
                shift
                ;;
            --verbose|-v)
                VERBOSE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Show help message
show_help() {
    cat << EOF
InsightSerenity Platform Service Orchestrator

Usage: $0 [environment] [options]

Environments:
    development    Development environment (default)
    staging        Staging environment
    production     Production environment

Options:
    --skip-health-check    Skip service health checks
    --gateway-only         Only start the API Gateway
    --verbose, -v          Enable verbose output
    --dry-run              Show what would be done without doing it
    --help, -h             Show this help message

Examples:
    $0                              Start all services in development
    $0 production                   Start all services in production
    $0 development --gateway-only   Start only gateway in development
    $0 staging --verbose            Start with verbose output

Environment Variables:
    GATEWAY_PORT     Gateway port (default: 3000)
    ADMIN_PORT       Admin server port (default: 4001)
    CUSTOMER_PORT    Customer services port (default: 4002)
    MONITORING_PORT  Monitoring port (default: 9090)

Files:
    Logs:     ${LOG_DIR}/
    PIDs:     ${PID_DIR}/
    Config:   ${PROJECT_ROOT}/.env.\${environment}

EOF
}

# Monitor services (tail logs)
monitor_services() {
    if command_exists multitail; then
        multitail \
            -i "${LOG_DIR}/gateway/gateway_${TIMESTAMP}.log" \
            -i "${LOG_DIR}/admin/admin_${TIMESTAMP}.log" \
            -i "${LOG_DIR}/customer/customer_${TIMESTAMP}.log"
    else
        info "Following gateway logs (install 'multitail' to view all logs)"
        tail -f "${LOG_DIR}/gateway/gateway_${TIMESTAMP}.log"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    # Parse arguments
    parse_arguments "$@"

    # Setup signal handlers
    trap signal_handler SIGINT SIGTERM

    # Print banner
    print_header "InsightSerenity Platform Service Orchestrator v1.0.0"
    info "Environment: ${ENVIRONMENT}"
    info "Timestamp: ${TIMESTAMP}"

    # Run startup sequence
    check_prerequisites
    create_directories
    load_environment
    start_all_services

    # Keep script running and monitor services
    if [[ "$DRY_RUN" == false ]]; then
        while true; do
            sleep 10
            
            # Check if services are still running
            if [[ -f "${PID_DIR}/gateway.pid" ]]; then
                if ! ps -p "$(cat "${PID_DIR}/gateway.pid")" > /dev/null 2>&1; then
                    error "Gateway crashed! Restarting..."
                    start_service \
                        "${PROJECT_ROOT}/servers/gateway" \
                        "gateway" \
                        "$GATEWAY_PORT"
                fi
            fi
            
            if [[ "$GATEWAY_ONLY" == false ]]; then
                if [[ -f "${PID_DIR}/admin.pid" ]]; then
                    if ! ps -p "$(cat "${PID_DIR}/admin.pid")" > /dev/null 2>&1; then
                        error "Admin Server crashed! Restarting..."
                        start_service \
                            "${PROJECT_ROOT}/servers/admin-server" \
                            "admin" \
                            "$ADMIN_PORT"
                    fi
                fi
                
                if [[ -f "${PID_DIR}/customer.pid" ]]; then
                    if ! ps -p "$(cat "${PID_DIR}/customer.pid")" > /dev/null 2>&1; then
                        error "Customer Services crashed! Restarting..."
                        start_service \
                            "${PROJECT_ROOT}/servers/customer-services" \
                            "customer" \
                            "$CUSTOMER_PORT"
                    fi
                fi
            fi
        done
    fi
}

# Run main function
main "$@"