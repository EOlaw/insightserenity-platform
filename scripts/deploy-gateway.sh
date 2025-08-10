#!/bin/bash

# Deploy API Gateway Script
# This script handles the deployment of the API Gateway to various environments

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GATEWAY_DIR="$PROJECT_ROOT/servers/gateway"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
ENVIRONMENT="development"
DEPLOY_METHOD="docker"
REGISTRY="docker.io"
IMAGE_NAME="insightserenity/api-gateway"
IMAGE_TAG="latest"
NAMESPACE="insightserenity"
ROLLBACK=false
DRY_RUN=false

# Function to print colored output
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to print usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy the InsightSerenity API Gateway

OPTIONS:
    -e, --environment ENV       Environment to deploy to (development|staging|production)
    -m, --method METHOD        Deployment method (docker|kubernetes|docker-compose)
    -r, --registry REGISTRY    Docker registry URL
    -i, --image IMAGE          Docker image name
    -t, --tag TAG             Docker image tag
    -n, --namespace NS        Kubernetes namespace
    --rollback                Rollback to previous version
    --dry-run                 Perform a dry run without actual deployment
    -h, --help               Show this help message

EXAMPLES:
    $0 -e production -m kubernetes
    $0 -e staging -m docker -t v1.2.3
    $0 -e development -m docker-compose
    $0 --rollback -e production

EOF
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -m|--method)
            DEPLOY_METHOD="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            print_message "$RED" "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_message "$RED" "Invalid environment: $ENVIRONMENT"
    exit 1
fi

# Function to check prerequisites
check_prerequisites() {
    print_message "$YELLOW" "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_message "$RED" "Docker is not installed"
        exit 1
    fi
    
    # Check kubectl for Kubernetes deployment
    if [[ "$DEPLOY_METHOD" == "kubernetes" ]]; then
        if ! command -v kubectl &> /dev/null; then
            print_message "$RED" "kubectl is not installed"
            exit 1
        fi
        
        # Check Kubernetes connectivity
        if ! kubectl cluster-info &> /dev/null; then
            print_message "$RED" "Cannot connect to Kubernetes cluster"
            exit 1
        fi
    fi
    
    # Check docker-compose for compose deployment
    if [[ "$DEPLOY_METHOD" == "docker-compose" ]]; then
        if ! command -v docker-compose &> /dev/null; then
            print_message "$RED" "docker-compose is not installed"
            exit 1
        fi
    fi
    
    print_message "$GREEN" "Prerequisites check passed"
}

# Function to build Docker image
build_docker_image() {
    print_message "$YELLOW" "Building Docker image..."
    
    cd "$GATEWAY_DIR"
    
    local full_image="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would build: $full_image"
    else
        docker build \
            --build-arg NODE_ENV="$ENVIRONMENT" \
            --tag "$full_image" \
            --tag "$REGISTRY/$IMAGE_NAME:latest" \
            --file Dockerfile \
            .
        
        print_message "$GREEN" "Docker image built: $full_image"
    fi
}

# Function to push Docker image
push_docker_image() {
    print_message "$YELLOW" "Pushing Docker image to registry..."
    
    local full_image="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would push: $full_image"
    else
        docker push "$full_image"
        docker push "$REGISTRY/$IMAGE_NAME:latest"
        
        print_message "$GREEN" "Docker image pushed: $full_image"
    fi
}

# Function to deploy with Docker
deploy_docker() {
    print_message "$YELLOW" "Deploying with Docker..."
    
    local container_name="api-gateway-$ENVIRONMENT"
    local full_image="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would deploy container: $container_name"
    else
        # Stop existing container
        docker stop "$container_name" 2>/dev/null || true
        docker rm "$container_name" 2>/dev/null || true
        
        # Run new container
        docker run -d \
            --name "$container_name" \
            --restart unless-stopped \
            -p 3000:3000 \
            -p 9090:9090 \
            --env-file "$GATEWAY_DIR/.env.$ENVIRONMENT" \
            --network insightserenity-network \
            "$full_image"
        
        print_message "$GREEN" "Container deployed: $container_name"
    fi
}

# Function to deploy with Docker Compose
deploy_docker_compose() {
    print_message "$YELLOW" "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    local compose_file="docker-compose.yml"
    local override_file="docker-compose.$ENVIRONMENT.yml"
    
    if [[ -f "$override_file" ]]; then
        compose_file="$compose_file -f $override_file"
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would run: docker-compose up -d gateway"
    else
        docker-compose $compose_file up -d gateway
        print_message "$GREEN" "Docker Compose deployment completed"
    fi
}

# Function to deploy to Kubernetes
deploy_kubernetes() {
    print_message "$YELLOW" "Deploying to Kubernetes..."
    
    local deployment_name="api-gateway"
    local full_image="$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    # Create namespace if it doesn't exist
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would create namespace: $NAMESPACE"
    else
        kubectl create namespace "$NAMESPACE" 2>/dev/null || true
    fi
    
    # Apply ConfigMap
    if [[ -f "$PROJECT_ROOT/kubernetes/gateway/gateway-configmap.yaml" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            print_message "$YELLOW" "[DRY RUN] Would apply ConfigMap"
        else
            kubectl apply -f "$PROJECT_ROOT/kubernetes/gateway/gateway-configmap.yaml" -n "$NAMESPACE"
        fi
    fi
    
    # Apply Secret
    if [[ -f "$PROJECT_ROOT/kubernetes/gateway/gateway-secret.yaml" ]]; then
        if [[ "$DRY_RUN" == true ]]; then
            print_message "$YELLOW" "[DRY RUN] Would apply Secret"
        else
            kubectl apply -f "$PROJECT_ROOT/kubernetes/gateway/gateway-secret.yaml" -n "$NAMESPACE"
        fi
    fi
    
    # Update deployment image
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "[DRY RUN] Would update deployment image to: $full_image"
    else
        kubectl set image deployment/"$deployment_name" \
            gateway="$full_image" \
            -n "$NAMESPACE" \
            --record
        
        # Wait for rollout to complete
        kubectl rollout status deployment/"$deployment_name" -n "$NAMESPACE"
    fi
    
    print_message "$GREEN" "Kubernetes deployment completed"
}

# Function to rollback deployment
rollback_deployment() {
    print_message "$YELLOW" "Rolling back deployment..."
    
    case "$DEPLOY_METHOD" in
        kubernetes)
            if [[ "$DRY_RUN" == true ]]; then
                print_message "$YELLOW" "[DRY RUN] Would rollback Kubernetes deployment"
            else
                kubectl rollout undo deployment/api-gateway -n "$NAMESPACE"
                kubectl rollout status deployment/api-gateway -n "$NAMESPACE"
            fi
            ;;
        docker)
            print_message "$YELLOW" "Docker rollback requires manual intervention"
            print_message "$YELLOW" "Please redeploy with the previous image tag"
            ;;
        docker-compose)
            cd "$PROJECT_ROOT"
            if [[ "$DRY_RUN" == true ]]; then
                print_message "$YELLOW" "[DRY RUN] Would rollback Docker Compose"
            else
                docker-compose down gateway
                git checkout HEAD~1 docker-compose.yml
                docker-compose up -d gateway
            fi
            ;;
    esac
    
    print_message "$GREEN" "Rollback completed"
}

# Function to run health check
health_check() {
    print_message "$YELLOW" "Running health check..."
    
    local health_url="http://localhost:3000/health"
    local max_attempts=30
    local attempt=0
    
    if [[ "$DEPLOY_METHOD" == "kubernetes" ]]; then
        health_url="http://$(kubectl get service api-gateway -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')/health"
    fi
    
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "$health_url" > /dev/null 2>&1; then
            print_message "$GREEN" "Health check passed"
            return 0
        fi
        
        attempt=$((attempt + 1))
        print_message "$YELLOW" "Waiting for service to be healthy... ($attempt/$max_attempts)"
        sleep 2
    done
    
    print_message "$RED" "Health check failed after $max_attempts attempts"
    return 1
}

# Function to create backup
create_backup() {
    print_message "$YELLOW" "Creating backup..."
    
    local backup_dir="$PROJECT_ROOT/backups/gateway/$TIMESTAMP"
    mkdir -p "$backup_dir"
    
    # Backup current configuration
    if [[ -f "$GATEWAY_DIR/.env.$ENVIRONMENT" ]]; then
        cp "$GATEWAY_DIR/.env.$ENVIRONMENT" "$backup_dir/"
    fi
    
    # Backup Kubernetes manifests if applicable
    if [[ "$DEPLOY_METHOD" == "kubernetes" ]]; then
        kubectl get deployment api-gateway -n "$NAMESPACE" -o yaml > "$backup_dir/deployment.yaml"
        kubectl get service api-gateway -n "$NAMESPACE" -o yaml > "$backup_dir/service.yaml"
        kubectl get configmap api-gateway-config -n "$NAMESPACE" -o yaml > "$backup_dir/configmap.yaml" 2>/dev/null || true
    fi
    
    print_message "$GREEN" "Backup created: $backup_dir"
}

# Function to send notification
send_notification() {
    local status=$1
    local message="Gateway deployment to $ENVIRONMENT: $status"
    
    # Send to Slack (if configured)
    if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || true
    fi
    
    # Log to file
    echo "$(date): $message" >> "$PROJECT_ROOT/logs/deployments.log"
}

# Main deployment flow
main() {
    print_message "$GREEN" "=== InsightSerenity API Gateway Deployment ==="
    print_message "$YELLOW" "Environment: $ENVIRONMENT"
    print_message "$YELLOW" "Method: $DEPLOY_METHOD"
    print_message "$YELLOW" "Image: $REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if [[ "$DRY_RUN" == true ]]; then
        print_message "$YELLOW" "*** DRY RUN MODE ***"
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Handle rollback
    if [[ "$ROLLBACK" == true ]]; then
        rollback_deployment
        health_check
        send_notification "ROLLBACK_SUCCESS"
        exit 0
    fi
    
    # Create backup
    create_backup
    
    # Build and push image
    build_docker_image
    push_docker_image
    
    # Deploy based on method
    case "$DEPLOY_METHOD" in
        docker)
            deploy_docker
            ;;
        docker-compose)
            deploy_docker_compose
            ;;
        kubernetes)
            deploy_kubernetes
            ;;
        *)
            print_message "$RED" "Invalid deployment method: $DEPLOY_METHOD"
            exit 1
            ;;
    esac
    
    # Run health check
    if health_check; then
        send_notification "SUCCESS"
        print_message "$GREEN" "=== Deployment completed successfully ==="
    else
        send_notification "FAILED"
        print_message "$RED" "=== Deployment failed ==="
        exit 1
    fi
}

# Run main function
main