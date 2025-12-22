# Production Environment Variables for InsightSerenity
# File: terraform/environments/production/production.tfvars

# Basic Configuration
aws_region  = "us-east-1"
environment = "production"
domain_name = "insightserenity.com"

# Network Configuration
vpc_cidr = "10.0.0.0/16"

# EKS Configuration
eks_cluster_version      = "1.28"
eks_node_instance_types  = ["t3.large", "t3.xlarge"]
eks_min_size            = 2
eks_max_size            = 10
eks_desired_size        = 3

# ElastiCache Configuration
redis_node_type       = "cache.t3.medium"
redis_num_cache_nodes = 1

# Security Configuration
enable_deletion_protection = true
enable_waf                = true
allowed_cidr_blocks       = ["0.0.0.0/0"] # Update with specific IPs/ranges

# Monitoring Configuration
log_retention_days     = 90
backup_retention_days  = 7
enable_monitoring      = true
enable_container_insights = true

# Auto-scaling Configuration
enable_auto_scaling = true
enable_spot_instances = false # Set to true for cost savings (development/staging)

# Additional Tags
tags = {
  CostCenter  = "Engineering"
  Compliance  = "GDPR-Ready"
  Criticality = "High"
  DataClass   = "Confidential"
  BackupPolicy = "Daily"
}

# Secrets (DO NOT commit actual values - use environment variables or AWS Secrets Manager)
# Set these via: export TF_VAR_mongodb_admin_uri="mongodb+srv://..."
# mongodb_admin_uri    = "" # Set via TF_VAR_mongodb_admin_uri
# mongodb_customer_uri = "" # Set via TF_VAR_mongodb_customer_uri
# jwt_secret          = "" # Set via TF_VAR_jwt_secret
# session_secret      = "" # Set via TF_VAR_session_secret
