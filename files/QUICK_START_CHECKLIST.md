# InsightSerenity AWS Deployment - Quick Start Checklist

This checklist provides a streamlined path from initial setup to production deployment. Complete each section in order for a successful deployment.

## Phase 1: Initial Setup (15-30 minutes)

### AWS Account Configuration
Begin by ensuring your AWS account is properly configured. Install the AWS CLI and configure your credentials using the `aws configure` command. You will need to provide your AWS Access Key ID, Secret Access Key, default region (recommend us-east-1), and output format (json recommended). Verify your configuration by running `aws sts get-caller-identity` to confirm your account access.

### Required Tools Installation
Install the necessary command-line tools for deployment. You will need kubectl for Kubernetes management, eksctl for EKS cluster operations, Terraform for infrastructure provisioning, Docker for container builds, and jq for JSON processing. Installation instructions for each tool are provided in the main deployment guide.

### Backend Setup
Create an S3 bucket to store Terraform state files. This bucket should have versioning enabled for state history and encryption enabled for security. The bucket name should follow the format `insightserenity-terraform-state-{environment}`. Additionally, create a DynamoDB table named `terraform-state-lock` for state locking to prevent concurrent modifications.

### Secrets Preparation
Gather all required secrets and credentials before beginning deployment. This includes MongoDB Atlas connection strings for both admin and customer databases, JWT secrets with minimum 32 characters, session secrets, AWS credentials for S3 access, Stripe API keys for payment processing, SendGrid API keys for email delivery, and OAuth credentials for third-party authentication providers.

## Phase 2: Infrastructure Deployment (30-45 minutes)

### Terraform Configuration
Navigate to the terraform directory and review the production.tfvars file. Update the domain name, AWS region, and other environment-specific settings. Do not commit actual secrets to this file. Instead, set them as environment variables using the TF_VAR_ prefix.

### Initialize Terraform
Run `terraform init` to initialize the Terraform working directory and download required providers. This step establishes the backend connection to S3 and prepares the local environment for infrastructure provisioning.

### Review Infrastructure Plan
Execute `terraform plan -var-file="environments/production/production.tfvars" -out=tfplan` to review all resources that will be created. Carefully examine the plan output to ensure it matches your expectations. This plan will create the VPC with multiple subnets across three availability zones, the EKS cluster with managed node groups, ElastiCache Redis cluster, Application Load Balancer, ECR repositories, S3 buckets, security groups, IAM roles, and CloudWatch log groups.

### Apply Infrastructure
After reviewing the plan, apply the changes using `terraform apply tfplan`. This process typically takes thirty to forty-five minutes as AWS provisions and configures all resources. Monitor the output for any errors or warnings. Upon completion, Terraform will output important values including the EKS cluster name, ElastiCache endpoint, ALB DNS name, and ECR repository URLs.

### Save Outputs
Save the Terraform outputs to a JSON file using `terraform output -json > ../deployment-outputs.json`. These outputs will be referenced throughout the deployment process.

## Phase 3: Kubernetes Configuration (15-20 minutes)

### Configure kubectl
Update your kubeconfig to connect to the newly created EKS cluster. Use the AWS CLI command `aws eks update-kubeconfig --name {cluster-name} --region {region}` with values from the Terraform outputs. Verify connectivity by running `kubectl cluster-info` and `kubectl get nodes` to confirm the cluster is accessible and nodes are ready.

### Create Kubernetes Namespace
Apply the namespace configuration using `kubectl apply -f kubernetes/shared-services/namespace.yaml`. This creates the insightserenity namespace where all application resources will be deployed.

### Configure Secrets
Create Kubernetes secrets containing sensitive configuration data. Use the kubectl create secret command with literal values from your environment variables. These secrets include database connection strings, JWT secrets, API keys, and AWS credentials. Verify secret creation with `kubectl get secrets -n insightserenity`.

### Update Ingress Configuration
Update the ingress-eks.yaml file with actual values from Terraform outputs. Replace the placeholders for ACM certificate ARN, security group IDs, and IAM role ARNs. This configuration enables the AWS Load Balancer Controller to provision and manage the Application Load Balancer.

## Phase 4: Application Deployment (20-30 minutes)

### Authenticate with ECR
Log in to Amazon ECR using `aws ecr get-login-password --region {region} | docker login --username AWS --password-stdin {account-id}.dkr.ecr.{region}.amazonaws.com`. This authentication enables Docker to push images to your ECR repositories.

### Build Docker Images
Build Docker images for each service using the provided Dockerfiles. For the admin server, use `docker build -t insightserenity/admin-server:{version} -f servers/admin-server/Dockerfile .`. Repeat this process for customer-services and api-gateway, adjusting the paths accordingly. Each build typically takes five to ten minutes depending on your system performance.

### Push Images to ECR
Tag each built image with the ECR repository URI and push to ECR. Tag with both the version number and latest tag to enable version tracking and easy rollback capability. Push each tag using `docker push {ecr-uri}:{tag}`.

### Update Kubernetes Manifests
Update all deployment manifests to reference the ECR image URIs instead of local image names. Update ConfigMaps with the ElastiCache Redis endpoint and other environment-specific values. These updates ensure Kubernetes pulls images from ECR and uses the correct infrastructure endpoints.

### Deploy Applications
Deploy applications to Kubernetes in the correct order. First apply persistent volume claims, then deploy the admin server, customer services, and API gateway. Apply each deployment using `kubectl apply -f kubernetes/{service}/`. Monitor deployment progress with `kubectl get pods -n insightserenity -w`.

### Verify Deployment
Wait for all pods to reach the Ready state using `kubectl wait --for=condition=ready pod -l app={service} -n insightserenity --timeout=300s`. Once ready, verify services are accessible through health check endpoints. Check the ingress status to obtain the Application Load Balancer DNS name.

## Phase 5: Frontend Deployment (15-20 minutes)

### Build Frontend
Navigate to the frontend directory and create a production environment file with the API URL and other configuration values. Run `npm run build` to build the Next.js application, followed by `npm run export` to generate static files in the out directory.

### Create S3 Bucket
Create an S3 bucket for hosting the frontend files. Configure the bucket for static website hosting with index.html as the index document. Apply a bucket policy that allows CloudFront to access the objects while blocking public access.

### Upload Frontend Files
Upload the built frontend files to S3 using the AWS CLI sync command. Apply appropriate cache-control headers: long cache durations for static assets and no-cache for HTML files to ensure updates are immediately visible to users.

### Configure CloudFront
Create a CloudFront distribution with the S3 bucket as the origin. Configure the distribution to use your ACM certificate for HTTPS, set appropriate caching behaviors, and enable compression. Note the CloudFront distribution ID and domain name for DNS configuration.

### Configure DNS
Update your Route 53 hosted zone to point your domain to the CloudFront distribution. Create an A record alias that points to the CloudFront distribution domain name. Repeat for the www subdomain if applicable.

## Phase 6: CI/CD Pipeline Setup (20-30 minutes)

### Create GitHub Connection
In the AWS CodePipeline console, navigate to Settings and create a connection to GitHub. This requires OAuth authorization through your GitHub account to grant AWS access to your repository.

### Create CodeBuild Projects
Create CodeBuild projects for each service using the provided buildspec files. Configure each project with the appropriate source repository, environment variables, and service role permissions. The build projects will compile code, run tests, build Docker images, and push to ECR.

### Create CodePipeline
Create a pipeline that orchestrates the entire deployment process. Configure the pipeline with GitHub as the source, CodeBuild for the build stage, and EKS as the deployment target. Set up separate pipelines for the frontend deployment if using continuous deployment for static assets.

### Configure Pipeline Triggers
Configure the pipeline to trigger automatically on commits to your main branch for production deployments and develop branch for staging deployments. Set up notifications to alert your team of deployment status changes.

### Test Pipeline
Trigger a manual pipeline execution to verify the entire CI/CD flow works correctly. Monitor each stage for successful completion and verify that the application deploys successfully and passes health checks.

## Phase 7: Monitoring and Security (15-20 minutes)

### Configure CloudWatch Dashboards
Create CloudWatch dashboards to visualize key metrics including CPU utilization, memory usage, request rates, error rates, and database connections. The dashboard provides real-time visibility into system health and performance.

### Create CloudWatch Alarms
Set up alarms for critical metrics. Configure alarms for high CPU usage, elevated error rates, unhealthy targets, and failed health checks. Configure SNS topics to send notifications to your operations team when alarms trigger.

### Enable Container Insights
Enable CloudWatch Container Insights for the EKS cluster to gain detailed visibility into pod and container performance. This provides metrics and logs aggregated at the cluster, namespace, service, and pod levels.

### Configure WAF
Create AWS WAF rules to protect your application from common web exploits. Configure rate limiting rules to prevent abuse, geo-blocking rules if needed, and custom rules based on your security requirements. Associate the WAF web ACL with your Application Load Balancer.

### Review Security Groups
Verify that security groups follow the principle of least privilege. Ensure the ALB security group only allows HTTPS traffic from the internet, the EKS node security group only allows necessary traffic from the ALB and between nodes, and the ElastiCache security group only allows Redis traffic from EKS nodes.

## Phase 8: Post-Deployment Verification (15 minutes)

### Smoke Testing
Run smoke tests against all deployed services to verify basic functionality. Test user authentication, database connectivity, cache operations, and key business workflows. Document any issues for immediate resolution.

### Performance Testing
Conduct basic performance testing to establish baseline metrics. Monitor response times, throughput, and resource utilization under normal load conditions. Use these baselines to configure auto-scaling policies and alerting thresholds.

### Review Logs
Review CloudWatch logs for any errors, warnings, or unexpected behavior. Ensure all services are logging properly and logs are being aggregated correctly. Adjust log levels if necessary to balance between visibility and storage costs.

### Update Documentation
Document the deployment architecture, access procedures, troubleshooting steps, and operational runbooks. Ensure your team has access to all necessary credentials and knows how to access monitoring dashboards and logs.

### Create Backup Strategy
Verify MongoDB Atlas backup configuration is active. Test backup restoration procedures to ensure you can recover from data loss. Document the backup schedule and retention policies.

## Ongoing Operations

### Regular Maintenance
Schedule regular maintenance activities including security updates, dependency updates, log review, performance optimization, and cost optimization. Establish a monthly review cycle to assess system health and identify improvement opportunities.

### Scaling Procedures
Monitor auto-scaling behavior and adjust HPA configurations based on actual usage patterns. Plan for capacity increases during expected high-traffic periods and document scaling procedures for emergency situations.

### Security Updates
Regularly update container base images, application dependencies, and Kubernetes versions. Subscribe to security advisories for all technologies in your stack and establish a process for rapid response to critical vulnerabilities.

### Cost Optimization
Review AWS cost reports monthly to identify optimization opportunities. Consider implementing Savings Plans or Reserved Instances for stable workloads, use Spot Instances for fault-tolerant workloads, and implement S3 lifecycle policies to reduce storage costs.

### Disaster Recovery Testing
Conduct quarterly disaster recovery drills to verify your recovery procedures work as expected. Test database restoration, service failover, and complete system recovery to ensure business continuity capabilities.

---

## Success Criteria

Your deployment is complete when all of the following conditions are met: all pods are running and passing health checks, the Application Load Balancer is forwarding traffic correctly to backend services, the frontend is accessible via CloudFront with a valid SSL certificate, monitoring dashboards show healthy metrics across all services, smoke tests pass for core functionality, secrets are properly configured and secured, backup procedures are verified and documented, the CI/CD pipeline successfully deploys new code without manual intervention, and your team can access logs and metrics for troubleshooting.

## Support Resources

The comprehensive deployment guide contains detailed instructions for each step. Terraform documentation provides reference for infrastructure configuration. The AWS EKS documentation covers cluster operations and troubleshooting. Kubernetes documentation explains concepts and commands. Your team should bookmark these resources and establish escalation procedures for issues requiring AWS support.
