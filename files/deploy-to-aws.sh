#!/bin/bash

# InsightSerenity AWS Deployment Automation Script
# This script automates the complete deployment process to AWS EKS
# Version: 1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${ENVIRONMENT:-production}
AWS_REGION=${AWS_REGION:-us-east-1}
TERRAFORM_DIR="./terraform"
K8S_DIR="./kubernetes"
VERSION=${VERSION:-latest}

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    command -v aws >/dev/null 2>&1 || missing_tools+=("aws-cli")
    command -v kubectl >/dev/null 2>&1 || missing_tools+=("kubectl")
    command -v terraform >/dev/null 2>&1 || missing_tools+=("terraform")
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v jq >/dev/null 2>&1 || missing_tools+=("jq")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install missing tools before continuing"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

deploy_infrastructure() {
    log_info "Deploying infrastructure with Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    # Initialize Terraform
    log_info "Initializing Terraform..."
    terraform init
    
    # Create workspace if it doesn't exist
    terraform workspace select "$ENVIRONMENT" 2>/dev/null || terraform workspace new "$ENVIRONMENT"
    
    # Plan
    log_info "Planning infrastructure changes..."
    terraform plan -var-file="environments/$ENVIRONMENT/$ENVIRONMENT.tfvars" -out=tfplan
    
    # Ask for confirmation
    echo ""
    read -p "Do you want to apply these changes? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warning "Deployment cancelled by user"
        exit 0
    fi
    
    # Apply
    log_info "Applying infrastructure changes..."
    terraform apply tfplan
    
    # Save outputs
    terraform output -json > ../deployment-outputs.json
    
    cd ..
    
    log_success "Infrastructure deployed successfully"
}

configure_kubectl() {
    log_info "Configuring kubectl for EKS cluster..."
    
    CLUSTER_NAME=$(jq -r '.eks_cluster_name.value' deployment-outputs.json)
    AWS_REGION=$(jq -r '.aws_region.value' deployment-outputs.json)
    
    aws eks update-kubeconfig --name "$CLUSTER_NAME" --region "$AWS_REGION"
    
    # Verify connection
    if kubectl cluster-info >/dev/null 2>&1; then
        log_success "kubectl configured successfully"
    else
        log_error "Failed to connect to EKS cluster"
        exit 1
    fi
}

create_secrets() {
    log_info "Creating Kubernetes secrets..."
    
    # Check if secrets already exist
    if kubectl get secret insightserenity-secrets -n insightserenity >/dev/null 2>&1; then
        log_warning "Secrets already exist. Skipping creation."
        return
    fi
    
    log_warning "Creating secrets from environment variables..."
    log_warning "Make sure the following environment variables are set:"
    log_warning "  - DATABASE_ADMIN_URI"
    log_warning "  - DATABASE_CUSTOMER_URI"
    log_warning "  - JWT_SECRET"
    log_warning "  - SESSION_SECRET"
    log_warning "  - REDIS_URL"
    
    read -p "Continue with secret creation? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log_warning "Skipping secret creation"
        return
    fi
    
    kubectl create secret generic insightserenity-secrets \
        --namespace=insightserenity \
        --from-literal=DATABASE_ADMIN_URI="${DATABASE_ADMIN_URI}" \
        --from-literal=DATABASE_CUSTOMER_URI="${DATABASE_CUSTOMER_URI}" \
        --from-literal=JWT_SECRET="${JWT_SECRET}" \
        --from-literal=SESSION_SECRET="${SESSION_SECRET}" \
        --from-literal=REFRESH_TOKEN_SECRET="${REFRESH_TOKEN_SECRET}" \
        --from-literal=REDIS_URL="${REDIS_URL}" \
        --from-literal=AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
        --from-literal=AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
        --from-literal=STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}" \
        --from-literal=SENDGRID_API_KEY="${SENDGRID_API_KEY:-}" \
        2>/dev/null || log_warning "Some secrets were not created (missing environment variables)"
    
    log_success "Secrets created"
}

build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    AWS_ACCOUNT_ID=$(jq -r '.ecr_repositories.value."admin-server"' deployment-outputs.json | cut -d'.' -f1)
    AWS_REGION=$(jq -r '.aws_region.value' deployment-outputs.json)
    
    # Login to ECR
    log_info "Logging in to ECR..."
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin \
        "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    # Build and push each service
    local services=("admin-server" "customer-services" "api-gateway")
    
    for service in "${services[@]}"; do
        log_info "Building $service..."
        
        local dockerfile_path="servers/${service//-server/}/Dockerfile"
        if [ "$service" = "api-gateway" ]; then
            dockerfile_path="servers/gateway/Dockerfile"
        fi
        
        local image_uri="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/${service}"
        
        docker build -t "$image_uri:$VERSION" -f "$dockerfile_path" .
        docker tag "$image_uri:$VERSION" "$image_uri:latest"
        
        log_info "Pushing $service..."
        docker push "$image_uri:$VERSION"
        docker push "$image_uri:latest"
        
        log_success "$service built and pushed"
    done
}

update_kubernetes_manifests() {
    log_info "Updating Kubernetes manifests..."
    
    AWS_ACCOUNT_ID=$(jq -r '.ecr_repositories.value."admin-server"' deployment-outputs.json | cut -d'.' -f1)
    AWS_REGION=$(jq -r '.aws_region.value' deployment-outputs.json)
    REDIS_ENDPOINT=$(jq -r '.elasticache_endpoint.value' deployment-outputs.json)
    ACM_CERT_ARN=$(jq -r '.acm_certificate_arn.value' deployment-outputs.json)
    ADMIN_ROLE_ARN=$(jq -r '.admin_server_role_arn.value' deployment-outputs.json)
    CUSTOMER_ROLE_ARN=$(jq -r '.customer_services_role_arn.value' deployment-outputs.json)
    
    # Update image URIs in deployments
    find "$K8S_DIR" -name "deployment.yaml" -exec sed -i \
        "s|image: insightserenity/|image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/|g" {} \;
    
    # Update Redis URL
    find "$K8S_DIR" -name "configmap.yaml" -exec sed -i \
        "s|REDIS_URL:.*|REDIS_URL: redis://${REDIS_ENDPOINT}:6379|g" {} \;
    
    # Update ingress with ACM certificate and IAM roles
    sed -i "s|\${ACM_CERTIFICATE_ARN}|${ACM_CERT_ARN}|g" "$K8S_DIR/shared-services/ingress-eks.yaml"
    sed -i "s|\${ADMIN_SERVER_ROLE_ARN}|${ADMIN_ROLE_ARN}|g" "$K8S_DIR/shared-services/ingress-eks.yaml"
    sed -i "s|\${CUSTOMER_SERVICES_ROLE_ARN}|${CUSTOMER_ROLE_ARN}|g" "$K8S_DIR/shared-services/ingress-eks.yaml"
    
    log_success "Manifests updated"
}

deploy_applications() {
    log_info "Deploying applications to Kubernetes..."
    
    # Create namespace
    kubectl apply -f "$K8S_DIR/shared-services/namespace.yaml"
    
    # Deploy in order
    kubectl apply -f "$K8S_DIR/shared-services/secrets.yaml" 2>/dev/null || log_warning "Secrets already exist"
    kubectl apply -f "$K8S_DIR/shared-services/pvc.yaml"
    kubectl apply -f "$K8S_DIR/shared-services/ingress-eks.yaml"
    
    # Deploy services
    kubectl apply -f "$K8S_DIR/admin-server/"
    kubectl apply -f "$K8S_DIR/customer-services/"
    kubectl apply -f "$K8S_DIR/shared-services/gateway-deployment.yaml"
    kubectl apply -f "$K8S_DIR/shared-services/gateway-service.yaml"
    
    log_success "Applications deployed"
}

wait_for_pods() {
    log_info "Waiting for pods to be ready..."
    
    kubectl wait --for=condition=ready pod \
        -l app=admin-server \
        -n insightserenity \
        --timeout=300s
    
    kubectl wait --for=condition=ready pod \
        -l app=customer-services \
        -n insightserenity \
        --timeout=300s
    
    kubectl wait --for=condition=ready pod \
        -l app=gateway \
        -n insightserenity \
        --timeout=300s
    
    log_success "All pods are ready"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    echo ""
    log_info "Pod Status:"
    kubectl get pods -n insightserenity
    
    echo ""
    log_info "Service Status:"
    kubectl get svc -n insightserenity
    
    echo ""
    log_info "Ingress Status:"
    kubectl get ingress -n insightserenity
    
    echo ""
    ALB_DNS=$(kubectl get ingress insightserenity-ingress -n insightserenity -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    log_success "Application Load Balancer DNS: $ALB_DNS"
    
    echo ""
    log_info "Health check URLs:"
    log_info "  - API Gateway: http://$ALB_DNS/health"
    log_info "  - Admin Server: http://$ALB_DNS/admin/health"
    log_info "  - Customer Services: http://$ALB_DNS/customer/health"
}

show_summary() {
    echo ""
    echo "=================================="
    log_success "DEPLOYMENT COMPLETED SUCCESSFULLY"
    echo "=================================="
    echo ""
    log_info "Next Steps:"
    echo "  1. Configure DNS records in Route 53"
    echo "  2. Verify SSL certificate validation"
    echo "  3. Run smoke tests"
    echo "  4. Configure monitoring alerts"
    echo "  5. Set up backup procedures"
    echo ""
    log_info "Useful Commands:"
    echo "  - View logs: kubectl logs -f <pod-name> -n insightserenity"
    echo "  - Port forward: kubectl port-forward svc/gateway-service 8080:80 -n insightserenity"
    echo "  - Get pod status: kubectl get pods -n insightserenity"
    echo "  - Describe pod: kubectl describe pod <pod-name> -n insightserenity"
    echo ""
}

# Main deployment flow
main() {
    echo "=================================="
    echo "InsightSerenity AWS Deployment"
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "=================================="
    echo ""
    
    check_prerequisites
    
    # Ask which steps to run
    echo "Select deployment steps:"
    read -p "1. Deploy infrastructure (Terraform)? (yes/no): " deploy_infra
    read -p "2. Build and push Docker images? (yes/no): " build_images
    read -p "3. Deploy applications to Kubernetes? (yes/no): " deploy_apps
    
    if [ "$deploy_infra" = "yes" ]; then
        deploy_infrastructure
        configure_kubectl
    fi
    
    if [ "$build_images" = "yes" ]; then
        build_and_push_images
        update_kubernetes_manifests
    fi
    
    if [ "$deploy_apps" = "yes" ]; then
        create_secrets
        deploy_applications
        wait_for_pods
        verify_deployment
    fi
    
    show_summary
}

# Run main function
main "$@"
