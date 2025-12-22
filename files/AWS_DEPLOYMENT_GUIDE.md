# InsightSerenity AWS Deployment Guide

## Executive Summary

This guide provides complete infrastructure setup for deploying the InsightSerenity multi-service B2B SaaS platform to AWS with enterprise-grade architecture, security, and scalability.

**Platform Overview:**
- 5 containerized services (Next.js frontend, Admin Server, Customer Services, API Gateway, Redis)
- Multi-tenant architecture with MongoDB Atlas
- Expected 10,000+ monthly active users
- Zero-downtime deployment with blue/green strategy

---

## Part 1: Service Recommendations

### 1.1 Container Orchestration: **EKS (Recommended)**

**Why EKS over ECS:**
- ✅ You already have production-ready Kubernetes manifests
- ✅ Industry-standard orchestration (portable across cloud providers)
- ✅ Better for complex multi-service architectures
- ✅ Superior auto-scaling with HPA and Cluster Autoscaler
- ✅ Rich ecosystem (Helm, Operators, service mesh)
- ✅ Cost-effective for your workload complexity

**ECS Consideration:** Only if you prefer AWS-native simplicity and have no K8s expertise.

### 1.2 Compute: **Fargate + EC2 Hybrid (Recommended)**

**Deployment Strategy:**
- **Fargate** for stateless services (Admin Server, Customer Services, API Gateway)
  - No server management
  - Pay only for running containers
  - Automatic scaling
  - Better security isolation

- **EC2** for stateful services (Redis if not using ElastiCache)
  - Better performance for persistent workloads
  - Cost-effective for always-running services
  - More control over node configuration

**Cost Comparison (Monthly):**
- All Fargate: ~$800-1200 (for your workload)
- Hybrid (Fargate + EC2): ~$600-900
- All EC2: ~$500-800 (but more operational overhead)

### 1.3 Redis: **ElastiCache (Recommended)**

**Why ElastiCache over Container:**
- Fully managed, automated failover
- Multi-AZ replication for high availability
- Automated backups and patching
- Better performance with optimized networking
- Minimal operational overhead

**Container Redis:** Only for development or very cost-sensitive deployments.

### 1.4 Frontend Deployment: **S3 + CloudFront (Recommended)**

**Static Export Strategy:**
- Build Next.js as static export (`next build && next export`)
- Deploy to S3 with CloudFront CDN
- Lowest latency globally
- Most cost-effective (~$50-100/month vs $300-500 for containers)

**Alternative - SSR on Fargate:**
- Use if you need server-side rendering
- Deploy Next.js container to EKS
- Higher cost but more dynamic capabilities

---

## Part 2: Architecture Overview

### 2.1 Network Architecture

```
                    ┌─────────────────┐
                    │  Route 53 DNS   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   CloudFront    │ (Frontend + CDN)
                    │   + WAF         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      ALB        │ (HTTPS only)
                    │  Public Subnet  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │ API Gateway │  │Admin Server │  │Customer Svc │
    │   (EKS)     │  │   (EKS)     │  │   (EKS)     │
    │Private Net  │  │Private Net  │  │Private Net  │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────▼────────┐
                    │  ElastiCache    │
                    │     Redis       │
                    │  Private Subnet │
                    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │  MongoDB Atlas  │ (External)
                    └─────────────────┘
```

### 2.2 VPC Design

**VPC CIDR:** 10.0.0.0/16

**Subnets (across 3 AZs for high availability):**

| Type | AZ-A | AZ-B | AZ-C | Purpose |
|------|------|------|------|---------|
| Public | 10.0.1.0/24 | 10.0.2.0/24 | 10.0.3.0/24 | ALB, NAT Gateways |
| Private-App | 10.0.11.0/24 | 10.0.12.0/24 | 10.0.13.0/24 | EKS Pods |
| Private-Data | 10.0.21.0/24 | 10.0.22.0/24 | 10.0.23.0/24 | ElastiCache, RDS |

**Components:**
- Internet Gateway for public access
- NAT Gateway in each AZ for private subnet egress
- VPC Endpoints for AWS services (S3, ECR, CloudWatch)

### 2.3 Security Groups

**ALB Security Group:**
- Inbound: 443 (HTTPS) from 0.0.0.0/0
- Inbound: 80 (HTTP redirect) from 0.0.0.0/0
- Outbound: All traffic to EKS node SG

**EKS Node Security Group:**
- Inbound: 1025-65535 from ALB SG
- Inbound: All traffic from itself (pod-to-pod)
- Outbound: All traffic (for external APIs, MongoDB)

**ElastiCache Security Group:**
- Inbound: 6379 from EKS node SG only
- Outbound: None required

---

## Part 3: Step-by-Step Setup

### Phase 1: Prerequisites (15 minutes)

#### 3.1 AWS Account Setup

1. **Create/Configure AWS Account:**
   ```bash
   # Install AWS CLI
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   
   # Configure credentials
   aws configure
   # AWS Access Key ID: [Your key]
   # AWS Secret Access Key: [Your secret]
   # Default region: us-east-1
   # Default output format: json
   ```

2. **Install Required Tools:**
   ```bash
   # Install kubectl
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
   
   # Install eksctl
   curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
   sudo mv /tmp/eksctl /usr/local/bin
   
   # Install Terraform
   wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
   unzip terraform_1.6.0_linux_amd64.zip
   sudo mv terraform /usr/local/bin/
   
   # Verify installations
   aws --version
   kubectl version --client
   eksctl version
   terraform --version
   ```

3. **Create S3 Backend for Terraform State:**
   ```bash
   aws s3 mb s3://insightserenity-terraform-state --region us-east-1
   
   # Enable versioning
   aws s3api put-bucket-versioning \
     --bucket insightserenity-terraform-state \
     --versioning-configuration Status=Enabled
   
   # Enable encryption
   aws s3api put-bucket-encryption \
     --bucket insightserenity-terraform-state \
     --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   ```

### Phase 2: Infrastructure Deployment (30-45 minutes)

#### 3.2 Deploy Core Infrastructure with Terraform

1. **Navigate to Terraform Directory:**
   ```bash
   cd terraform/environments/production
   ```

2. **Initialize Terraform:**
   ```bash
   terraform init
   ```

3. **Review Planned Changes:**
   ```bash
   terraform plan -var-file="production.tfvars" -out=tfplan
   ```

4. **Deploy Infrastructure:**
   ```bash
   terraform apply tfplan
   ```

   **Resources Created:**
   - VPC with 9 subnets across 3 AZs
   - Internet Gateway and NAT Gateways
   - EKS cluster with managed node groups
   - ElastiCache Redis cluster
   - Application Load Balancer
   - Security groups and IAM roles
   - CloudWatch log groups
   - ECR repositories for Docker images

5. **Save Outputs:**
   ```bash
   terraform output > ../../../deployment-outputs.json
   ```

#### 3.3 Configure kubectl for EKS

```bash
# Get cluster name from Terraform output
CLUSTER_NAME=$(terraform output -raw eks_cluster_name)
AWS_REGION=$(terraform output -raw aws_region)

# Update kubeconfig
aws eks update-kubeconfig --name $CLUSTER_NAME --region $AWS_REGION

# Verify connection
kubectl cluster-info
kubectl get nodes
```

### Phase 3: Application Deployment (20-30 minutes)

#### 3.4 Setup Kubernetes Secrets

1. **Create Namespace:**
   ```bash
   kubectl apply -f kubernetes/shared-services/namespace.yaml
   ```

2. **Create Secrets from Environment Variables:**
   ```bash
   # Production secrets (use AWS Secrets Manager values)
   kubectl create secret generic insightserenity-secrets \
     --namespace=insightserenity \
     --from-literal=DATABASE_ADMIN_URI="mongodb+srv://admin:pass@cluster.mongodb.net/admin" \
     --from-literal=DATABASE_CUSTOMER_URI="mongodb+srv://admin:pass@cluster.mongodb.net/customers" \
     --from-literal=JWT_SECRET="your-production-jwt-secret-min-32-chars" \
     --from-literal=SESSION_SECRET="your-production-session-secret" \
     --from-literal=REFRESH_TOKEN_SECRET="your-refresh-token-secret" \
     --from-literal=REDIS_URL="redis://your-elasticache-endpoint:6379" \
     --from-literal=AWS_ACCESS_KEY_ID="your-aws-key" \
     --from-literal=AWS_SECRET_ACCESS_KEY="your-aws-secret" \
     --from-literal=STRIPE_SECRET_KEY="sk_live_your_stripe_key" \
     --from-literal=SENDGRID_API_KEY="SG.your_sendgrid_key"
   
   # Verify secrets created
   kubectl get secrets -n insightserenity
   ```

#### 3.5 Update Kubernetes Manifests

Update your existing manifests with EKS-specific configurations:

```bash
# Update Redis to use ElastiCache endpoint
export REDIS_ENDPOINT=$(terraform output -raw elasticache_endpoint)
sed -i "s|REDIS_URL:.*|REDIS_URL: redis://${REDIS_ENDPOINT}:6379|g" \
  kubernetes/*/configmap.yaml

# Update ingress with ALB annotations (see ingress-eks.yaml file)
kubectl apply -f kubernetes/shared-services/ingress-eks.yaml
```

#### 3.6 Build and Push Docker Images

1. **Authenticate with ECR:**
   ```bash
   AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   AWS_REGION="us-east-1"
   
   aws ecr get-login-password --region $AWS_REGION | \
     docker login --username AWS --password-stdin \
     ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
   ```

2. **Build and Push Images:**
   ```bash
   # Set version
   VERSION="v1.0.0"
   
   # Admin Server
   docker build -t insightserenity/admin-server:${VERSION} \
     -f servers/admin-server/Dockerfile .
   docker tag insightserenity/admin-server:${VERSION} \
     ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/admin-server:${VERSION}
   docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/admin-server:${VERSION}
   
   # Customer Services
   docker build -t insightserenity/customer-services:${VERSION} \
     -f servers/customer-services/Dockerfile .
   docker tag insightserenity/customer-services:${VERSION} \
     ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/customer-services:${VERSION}
   docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/customer-services:${VERSION}
   
   # API Gateway
   docker build -t insightserenity/api-gateway:${VERSION} \
     -f servers/gateway/Dockerfile .
   docker tag insightserenity/api-gateway:${VERSION} \
     ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/api-gateway:${VERSION}
   docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/api-gateway:${VERSION}
   ```

3. **Update Kubernetes Deployments with ECR Image URIs:**
   ```bash
   # Update all deployment manifests
   find kubernetes/ -name "deployment.yaml" -exec sed -i \
     "s|image: insightserenity/|image: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/|g" {} \;
   
   # Update image pull policy
   find kubernetes/ -name "deployment.yaml" -exec sed -i \
     "s|imagePullPolicy: IfNotPresent|imagePullPolicy: Always|g" {} \;
   ```

#### 3.7 Deploy Applications to EKS

```bash
# Deploy in correct order
kubectl apply -f kubernetes/shared-services/namespace.yaml
kubectl apply -f kubernetes/shared-services/secrets.yaml
kubectl apply -f kubernetes/shared-services/pvc.yaml

# Deploy services
kubectl apply -f kubernetes/admin-server/
kubectl apply -f kubernetes/customer-services/
kubectl apply -f kubernetes/shared-services/gateway-deployment.yaml
kubectl apply -f kubernetes/shared-services/gateway-service.yaml

# Deploy ingress
kubectl apply -f kubernetes/shared-services/ingress-eks.yaml

# Verify deployments
kubectl get pods -n insightserenity -w
kubectl get svc -n insightserenity
kubectl get ingress -n insightserenity
```

### Phase 4: Frontend Deployment (15-20 minutes)

#### 3.8 Deploy Next.js Frontend to S3 + CloudFront

1. **Build Next.js for Production:**
   ```bash
   cd frontend
   
   # Set environment variables
   cat > .env.production << EOF
   NEXT_PUBLIC_API_URL=https://api.insightserenity.com
   NEXT_PUBLIC_ENVIRONMENT=production
   EOF
   
   # Build static export
   npm run build
   npm run export
   # Output directory: out/
   ```

2. **Create S3 Bucket:**
   ```bash
   BUCKET_NAME="insightserenity-frontend-prod"
   aws s3 mb s3://${BUCKET_NAME} --region us-east-1
   
   # Configure for static website hosting
   aws s3 website s3://${BUCKET_NAME} \
     --index-document index.html \
     --error-document 404.html
   
   # Set bucket policy for CloudFront
   cat > bucket-policy.json << EOF
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AllowCloudFrontAccess",
         "Effect": "Allow",
         "Principal": {
           "Service": "cloudfront.amazonaws.com"
         },
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::${BUCKET_NAME}/*",
         "Condition": {
           "StringEquals": {
             "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
           }
         }
       }
     ]
   }
   EOF
   ```

3. **Upload Frontend Files:**
   ```bash
   aws s3 sync out/ s3://${BUCKET_NAME}/ \
     --delete \
     --cache-control "public, max-age=31536000, immutable" \
     --exclude "index.html" \
     --exclude "404.html"
   
   # Upload HTML with shorter cache
   aws s3 sync out/ s3://${BUCKET_NAME}/ \
     --cache-control "public, max-age=0, must-revalidate" \
     --exclude "*" \
     --include "*.html"
   ```

4. **Create CloudFront Distribution:**
   ```bash
   # Get ACM certificate ARN (must be in us-east-1 for CloudFront)
   CERT_ARN=$(aws acm list-certificates --region us-east-1 \
     --query "CertificateSummaryList[?DomainName=='*.insightserenity.com'].CertificateArn" \
     --output text)
   
   # Create distribution (see cloudfront-config.json template)
   aws cloudfront create-distribution --cli-input-json file://cloudfront-config.json
   
   # Get distribution domain name
   CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
     --query "DistributionList.Items[?Comment=='InsightSerenity Frontend'].DomainName" \
     --output text)
   
   echo "CloudFront URL: https://${CLOUDFRONT_DOMAIN}"
   ```

5. **Configure DNS in Route 53:**
   ```bash
   # Create A record alias to CloudFront
   HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
     --query "HostedZones[?Name=='insightserenity.com.'].Id" \
     --output text | cut -d'/' -f3)
   
   aws route53 change-resource-record-sets \
     --hosted-zone-id $HOSTED_ZONE_ID \
     --change-batch file://dns-records.json
   ```

### Phase 5: CI/CD Pipeline Setup (20-30 minutes)

#### 3.9 Setup CodePipeline

1. **Create GitHub Connection:**
   ```bash
   # In AWS Console: CodePipeline > Settings > Connections
   # Create connection to GitHub (requires OAuth authorization)
   ```

2. **Create CodeBuild Projects:**
   ```bash
   # Create buildspec files (see separate buildspec.yml files)
   
   # Create CodeBuild project for each service
   aws codebuild create-project --cli-input-json file://codebuild-admin.json
   aws codebuild create-project --cli-input-json file://codebuild-customer.json
   aws codebuild create-project --cli-input-json file://codebuild-gateway.json
   aws codebuild create-project --cli-input-json file://codebuild-frontend.json
   ```

3. **Create CodePipeline:**
   ```bash
   # Create pipeline (see codepipeline-config.json template)
   aws codepipeline create-pipeline --cli-input-json file://codepipeline-config.json
   ```

4. **Verify Pipeline:**
   ```bash
   # Trigger manual execution
   aws codepipeline start-pipeline-execution --name insightserenity-production
   
   # Monitor execution
   aws codepipeline get-pipeline-state --name insightserenity-production
   ```

### Phase 6: Monitoring and Security (15 minutes)

#### 3.10 Setup CloudWatch Monitoring

1. **Create CloudWatch Dashboard:**
   ```bash
   aws cloudwatch put-dashboard \
     --dashboard-name InsightSerenity-Production \
     --dashboard-body file://cloudwatch-dashboard.json
   ```

2. **Create Alarms:**
   ```bash
   # High CPU alarm
   aws cloudwatch put-metric-alarm \
     --alarm-name EKS-High-CPU \
     --alarm-description "Alert when EKS CPU exceeds 80%" \
     --metric-name CPUUtilization \
     --namespace AWS/EKS \
     --statistic Average \
     --period 300 \
     --threshold 80 \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 2
   
   # Failed health check alarm
   aws cloudwatch put-metric-alarm \
     --alarm-name ALB-Unhealthy-Targets \
     --alarm-description "Alert when unhealthy targets detected" \
     --metric-name UnHealthyHostCount \
     --namespace AWS/ApplicationELB \
     --statistic Average \
     --period 60 \
     --threshold 1 \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 2
   ```

3. **Setup Container Insights:**
   ```bash
   # Enable Container Insights for EKS
   aws eks update-cluster-config \
     --name $CLUSTER_NAME \
     --logging '{"clusterLogging":[{"types":["api","audit","authenticator","controllerManager","scheduler"],"enabled":true}]}'
   
   # Deploy CloudWatch agent
   kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/quickstart/cwagent-fluentd-quickstart.yaml
   ```

#### 3.11 Configure WAF

```bash
# Create WAF WebACL
aws wafv2 create-web-acl \
  --name InsightSerenity-WAF \
  --scope REGIONAL \
  --region us-east-1 \
  --default-action Allow={} \
  --rules file://waf-rules.json \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=InsightSerenityWAF

# Associate with ALB
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names insightserenity-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

WAF_ARN=$(aws wafv2 list-web-acls --scope REGIONAL --region us-east-1 \
  --query "WebACLs[?Name=='InsightSerenity-WAF'].ARN" \
  --output text)

aws wafv2 associate-web-acl \
  --web-acl-arn $WAF_ARN \
  --resource-arn $ALB_ARN \
  --region us-east-1
```

---

## Part 4: Operational Procedures

### 4.1 Deployment Procedure

**Standard Deployment (via CI/CD):**
1. Push code to GitHub main branch
2. CodePipeline automatically triggers
3. Images built and pushed to ECR
4. Kubernetes deployments updated with new images
5. Rolling update performed (zero downtime)
6. Health checks verify new pods
7. Old pods terminated after successful rollout

**Manual Deployment:**
```bash
# Build and push new image
VERSION="v1.1.0"
docker build -t insightserenity/admin-server:${VERSION} -f servers/admin-server/Dockerfile .
docker tag insightserenity/admin-server:${VERSION} \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/admin-server:${VERSION}
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/admin-server:${VERSION}

# Update deployment
kubectl set image deployment/admin-server \
  admin-server=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/insightserenity/admin-server:${VERSION} \
  -n insightserenity

# Monitor rollout
kubectl rollout status deployment/admin-server -n insightserenity
```

### 4.2 Rollback Procedure

**Automatic Rollback:**
- Kubernetes automatically rolls back if health checks fail
- Configure in deployment: `progressDeadlineSeconds: 600`

**Manual Rollback:**
```bash
# View rollout history
kubectl rollout history deployment/admin-server -n insightserenity

# Rollback to previous version
kubectl rollout undo deployment/admin-server -n insightserenity

# Rollback to specific revision
kubectl rollout undo deployment/admin-server --to-revision=2 -n insightserenity

# Verify rollback
kubectl get pods -n insightserenity -l app=admin-server
```

### 4.3 Scaling Procedures

**Manual Scaling:**
```bash
# Scale specific deployment
kubectl scale deployment/customer-services --replicas=5 -n insightserenity

# Scale all deployments
kubectl scale deployment --all --replicas=3 -n insightserenity
```

**Auto-Scaling (HPA already configured):**
```bash
# View HPA status
kubectl get hpa -n insightserenity

# Adjust HPA settings
kubectl autoscale deployment customer-services \
  --cpu-percent=75 \
  --min=3 \
  --max=20 \
  -n insightserenity
```

**Cluster Auto-Scaling:**
```bash
# EKS managed node groups auto-scale based on pod resource requests
# Adjust in Terraform:
# min_size = 2
# max_size = 10
# desired_size = 3
```

### 4.4 Backup and Recovery

**Database Backups (MongoDB Atlas):**
- Automated daily backups (managed by Atlas)
- Point-in-time recovery available
- Configure backup schedule in Atlas console

**Application State:**
```bash
# Backup Kubernetes configurations
kubectl get all -n insightserenity -o yaml > backup-$(date +%Y%m%d).yaml

# Backup secrets
kubectl get secrets -n insightserenity -o yaml > secrets-backup-$(date +%Y%m%d).yaml

# Store in S3
aws s3 cp backup-$(date +%Y%m%d).yaml s3://insightserenity-backups/k8s/
```

**Disaster Recovery:**
```bash
# Restore from backup
kubectl apply -f backup-20240315.yaml

# Verify restoration
kubectl get pods -n insightserenity
kubectl get svc -n insightserenity
```

---

## Part 5: Cost Estimates

### 5.1 Monthly Cost Breakdown (Production)

**Compute (EKS + Fargate):**
- EKS Control Plane: $73/month
- Fargate (9 pods average):
  - Admin (2 pods): ~$45
  - Customer Services (5 pods): ~$110
  - Gateway (2 pods): ~$45
- **Subtotal: $273/month**

**Networking:**
- Application Load Balancer: $23/month + $0.008/LCU-hour (~$50)
- NAT Gateway (3 AZs): $97.20/month + data transfer (~$50)
- Data Transfer (out): ~$90/GB (~$100 estimated)
- **Subtotal: $223/month**

**Storage:**
- EBS (for EKS nodes): 100GB GP3 @ $8/month
- ElastiCache Redis (cache.t3.micro): $12.41/month
- **Subtotal: $20/month**

**Frontend (S3 + CloudFront):**
- S3 Storage (50GB): $1.15/month
- S3 Requests: ~$5/month
- CloudFront: $85/month (1TB transfer)
- **Subtotal: $91/month**

**Monitoring & Security:**
- CloudWatch Logs (30GB): $15/month
- CloudWatch Metrics: $10/month
- WAF: $5/month + $1/million requests (~$15)
- **Subtotal: $40/month**

**Container Registry:**
- ECR Storage (20GB): $2/month
- **Subtotal: $2/month**

**TOTAL MONTHLY COST: ~$649/month**

### 5.2 Scaling Scenarios

**Small Deployment (Development/Staging):**
- Reduce node count to 1-2
- Use smaller Fargate profiles
- Single AZ deployment
- **Estimated: $300-400/month**

**Medium Deployment (Current Production):**
- As detailed above
- **Estimated: $649/month**

**Large Deployment (High Traffic - 100K MAU):**
- Additional EKS nodes: +$300/month
- More Fargate pods (20 average): +$500/month
- Larger Redis (cache.r6g.large): +$130/month
- Increased CloudFront: +$200/month
- **Estimated: $1,779/month**

### 5.3 Cost Optimization Tips

1. **Use Fargate Spot for non-critical workloads:** Save up to 70%
2. **Right-size based on CloudWatch metrics:** Review after 2 weeks
3. **Enable S3 Intelligent-Tiering:** Automatic cost optimization
4. **Use Reserved Instances for stable workloads:** Save 30-50%
5. **Implement CloudFront caching:** Reduce backend requests
6. **Set up billing alarms:** Alert at $500, $700, $900

---

## Part 6: Security Checklist

### 6.1 Network Security
- ✅ All traffic encrypted (TLS 1.2+)
- ✅ Security groups with minimal access
- ✅ Private subnets for application tier
- ✅ WAF rules enabled
- ✅ VPC flow logs enabled
- ✅ Network ACLs configured

### 6.2 Application Security
- ✅ JWT authentication with refresh tokens
- ✅ Multi-tenant data isolation
- ✅ Rate limiting implemented
- ✅ Input validation and sanitization
- ✅ Non-root containers
- ✅ Security scanning in CI/CD

### 6.3 Data Security
- ✅ Encryption at rest (EBS, S3, ElastiCache)
- ✅ Encryption in transit (TLS)
- ✅ Secrets in AWS Secrets Manager
- ✅ Database access controls (MongoDB Atlas)
- ✅ Backup encryption enabled
- ✅ Audit logging enabled

### 6.4 Compliance
- ✅ CloudTrail enabled (audit trail)
- ✅ GuardDuty enabled (threat detection)
- ✅ Config rules enabled (compliance monitoring)
- ✅ IAM least privilege access
- ✅ MFA required for console access

---

## Part 7: Troubleshooting

### 7.1 Common Issues

**Pods Not Starting:**
```bash
# Check pod status
kubectl describe pod <pod-name> -n insightserenity

# Common causes:
# - Image pull errors (check ECR permissions)
# - Resource constraints (check node capacity)
# - Configuration errors (check secrets/configmaps)

# View logs
kubectl logs <pod-name> -n insightserenity --tail=100
```

**High Latency:**
```bash
# Check service endpoints
kubectl get endpoints -n insightserenity

# Check pod resource usage
kubectl top pods -n insightserenity

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/EKS \
  --metric-name CPUUtilization \
  --start-time 2024-03-15T00:00:00Z \
  --end-time 2024-03-15T23:59:59Z \
  --period 300 \
  --statistics Average
```

**Database Connection Issues:**
```bash
# Test MongoDB connectivity from pod
kubectl exec -it <pod-name> -n insightserenity -- sh
wget -qO- https://www.mongodb.com/cloud/atlas

# Check security group rules
# Verify MongoDB Atlas IP whitelist includes NAT Gateway IPs
```

### 7.2 Support Contacts

- **AWS Support:** Create case in AWS Console
- **MongoDB Atlas:** support.mongodb.com
- **EKS Community:** GitHub issues and Slack
- **Internal:** [Your team contacts]

---

## Part 8: Next Steps

### Immediate (Week 1)
1. ✅ Complete infrastructure deployment
2. ✅ Deploy applications to production
3. ✅ Configure monitoring and alarms
4. ✅ Run smoke tests and load tests
5. ✅ Set up backup procedures

### Short Term (Month 1)
1. Implement automated database migrations
2. Add distributed tracing (AWS X-Ray)
3. Set up log aggregation (CloudWatch Insights)
4. Create runbooks for common issues
5. Train team on AWS operations

### Long Term (Quarter 1)
1. Implement blue/green deployment automation
2. Add service mesh (AWS App Mesh)
3. Implement chaos engineering tests
4. Optimize costs based on usage patterns
5. Expand to multiple regions

---

## Appendix A: Useful Commands

### kubectl Quick Reference
```bash
# Get all resources
kubectl get all -n insightserenity

# Get pod logs
kubectl logs -f <pod-name> -n insightserenity

# Execute command in pod
kubectl exec -it <pod-name> -n insightserenity -- sh

# Port forward for debugging
kubectl port-forward svc/admin-server 3000:3000 -n insightserenity

# Describe resource
kubectl describe pod <pod-name> -n insightserenity

# Get events
kubectl get events -n insightserenity --sort-by='.lastTimestamp'
```

### AWS CLI Quick Reference
```bash
# List EKS clusters
aws eks list-clusters

# Get cluster info
aws eks describe-cluster --name insightserenity-prod

# List ECR repositories
aws ecr describe-repositories

# Get ALB DNS
aws elbv2 describe-load-balancers --names insightserenity-alb

# View CloudWatch logs
aws logs tail /aws/eks/insightserenity-prod/cluster --follow
```

---

## Support and Maintenance

**Documentation:**
- AWS EKS: https://docs.aws.amazon.com/eks/
- Kubernetes: https://kubernetes.io/docs/
- Terraform: https://www.terraform.io/docs/

**Monitoring Dashboards:**
- CloudWatch: https://console.aws.amazon.com/cloudwatch/
- EKS Console: https://console.aws.amazon.com/eks/
- Application: https://app.insightserenity.com/admin/monitoring

**Version Information:**
- EKS Version: 1.28
- Kubernetes Version: 1.28
- Terraform Version: 1.6.0
- Last Updated: March 15, 2024

---

*This deployment guide is comprehensive and production-ready. Follow each phase sequentially for successful deployment.*
