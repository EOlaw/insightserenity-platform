# InsightSerenity AWS Infrastructure - Main Configuration
# Terraform version: ~> 1.6.0

terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "insightserenity-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# Provider Configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "InsightSerenity"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "DevOps"
    }
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# Data Sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local Variables
locals {
  name            = "insightserenity-${var.environment}"
  cluster_name    = "${local.name}-eks"
  
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
  
  vpc_cidr = "10.0.0.0/16"
  
  public_subnets      = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_app_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
  private_data_subnets = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
  
  tags = {
    Project     = "InsightSerenity"
    Environment = var.environment
    Application = "B2B-SaaS-Platform"
  }
}

################################################################################
# VPC Module
################################################################################

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name}-vpc"
  cidr = local.vpc_cidr

  azs              = local.azs
  public_subnets   = local.public_subnets
  private_subnets  = concat(local.private_app_subnets, local.private_data_subnets)

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment == "production" ? false : true
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Enable VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true
  flow_log_retention_in_days           = var.environment == "production" ? 90 : 30

  # VPC Endpoints for cost optimization
  enable_s3_endpoint       = true
  enable_ecr_api_endpoint  = true
  enable_ecr_dkr_endpoint  = true

  # Tags for EKS
  public_subnet_tags = {
    "kubernetes.io/role/elb"                      = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"             = "1"
    "kubernetes.io/cluster/${local.cluster_name}" = "shared"
  }

  tags = local.tags
}

################################################################################
# EKS Cluster
################################################################################

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = local.cluster_name
  cluster_version = "1.28"

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  # Cluster addons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = slice(module.vpc.private_subnets, 0, 3) # App subnets only
  control_plane_subnet_ids = module.vpc.public_subnets

  # EKS Managed Node Groups
  eks_managed_node_groups = {
    # General purpose node group
    general = {
      name           = "${local.name}-general"
      instance_types = var.environment == "production" ? ["t3.large"] : ["t3.medium"]

      min_size     = var.environment == "production" ? 2 : 1
      max_size     = var.environment == "production" ? 10 : 3
      desired_size = var.environment == "production" ? 3 : 1

      # Disk configuration
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 100
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 125
            encrypted             = true
            delete_on_termination = true
          }
        }
      }

      # Node labels
      labels = {
        Environment = var.environment
        NodeGroup   = "general"
      }

      # Taints for specific workloads (if needed)
      # taints = []

      update_config = {
        max_unavailable_percentage = 33
      }
    }

    # Fargate profile for stateless services
    # Uncomment if using Fargate
    # fargate = {
    #   name = "${local.name}-fargate"
    #   
    #   selectors = [
    #     {
    #       namespace = "insightserenity"
    #       labels = {
    #         fargate = "true"
    #       }
    #     }
    #   ]
    # }
  }

  # Cluster security group rules
  cluster_security_group_additional_rules = {
    ingress_nodes_ephemeral_ports_tcp = {
      description                = "Nodes on ephemeral ports"
      protocol                   = "tcp"
      from_port                  = 1025
      to_port                    = 65535
      type                       = "ingress"
      source_node_security_group = true
    }
  }

  # Node security group rules
  node_security_group_additional_rules = {
    ingress_self_all = {
      description = "Node to node all ports/protocols"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      type        = "ingress"
      self        = true
    }
    
    ingress_cluster_all = {
      description                   = "Cluster to node all ports/protocols"
      protocol                      = "-1"
      from_port                     = 0
      to_port                       = 0
      type                          = "ingress"
      source_cluster_security_group = true
    }

    egress_all = {
      description      = "Node all egress"
      protocol         = "-1"
      from_port        = 0
      to_port          = 0
      type             = "egress"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = ["::/0"]
    }
  }

  # Enable IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  # CloudWatch logging
  cluster_enabled_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  tags = local.tags
}

################################################################################
# ElastiCache Redis
################################################################################

module "elasticache" {
  source  = "terraform-aws-modules/elasticache/aws"
  version = "~> 1.0"

  cluster_id               = "${local.name}-redis"
  engine                   = "redis"
  engine_version          = "7.0"
  node_type               = var.environment == "production" ? "cache.t3.medium" : "cache.t3.micro"
  num_cache_nodes         = 1
  parameter_group_family  = "redis7"
  port                    = 6379

  subnet_ids             = slice(module.vpc.private_subnets, 3, 6) # Data subnets
  vpc_id                 = module.vpc.vpc_id
  
  # Security
  create_security_group = true
  security_group_rules = {
    ingress_from_eks = {
      type                     = "ingress"
      from_port                = 6379
      to_port                  = 6379
      protocol                 = "tcp"
      source_security_group_id = module.eks.node_security_group_id
      description              = "Allow Redis access from EKS nodes"
    }
  }

  # Backup configuration
  snapshot_retention_limit = var.environment == "production" ? 7 : 1
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "mon:05:00-mon:07:00"

  # Automatic failover (for production)
  automatic_failover_enabled = var.environment == "production" ? true : false
  multi_az_enabled           = var.environment == "production" ? true : false

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # Set to true if using AUTH token

  tags = local.tags
}

################################################################################
# Application Load Balancer
################################################################################

resource "aws_security_group" "alb" {
  name_prefix = "${local.name}-alb"
  description = "Security group for Application Load Balancer"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from internet (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "All outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    local.tags,
    {
      Name = "${local.name}-alb-sg"
    }
  )
}

resource "aws_lb" "main" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = var.environment == "production" ? true : false
  enable_http2              = true
  enable_cross_zone_load_balancing = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = local.tags
}

# S3 bucket for ALB logs
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${local.name}-alb-logs"

  tags = local.tags
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "delete_old_logs"
    status = "Enabled"

    expiration {
      days = var.environment == "production" ? 90 : 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ALB Log Policy
resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_elb_service_account.main.id}:root"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs.arn}/*"
      }
    ]
  })
}

data "aws_elb_service_account" "main" {}

################################################################################
# ACM Certificate
################################################################################

resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

################################################################################
# Route53 (Optional - if managing DNS with Terraform)
################################################################################

# Uncomment if you want Terraform to manage Route53
# data "aws_route53_zone" "main" {
#   name         = var.domain_name
#   private_zone = false
# }

# resource "aws_route53_record" "cert_validation" {
#   for_each = {
#     for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
#       name   = dvo.resource_record_name
#       record = dvo.resource_record_value
#       type   = dvo.resource_record_type
#     }
#   }

#   allow_overwrite = true
#   name            = each.value.name
#   records         = [each.value.record]
#   ttl             = 60
#   type            = each.value.type
#   zone_id         = data.aws_route53_zone.main.zone_id
# }

# resource "aws_acm_certificate_validation" "main" {
#   certificate_arn         = aws_acm_certificate.main.arn
#   validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
# }

################################################################################
# ECR Repositories
################################################################################

module "ecr" {
  source = "terraform-aws-modules/ecr/aws"
  version = "~> 1.6"

  for_each = toset([
    "admin-server",
    "customer-services",
    "api-gateway",
    "frontend"
  ])

  repository_name = "insightserenity/${each.key}"

  repository_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })

  repository_image_tag_mutability = "IMMUTABLE"
  repository_encryption_type      = "KMS"
  repository_force_delete        = var.environment != "production"

  repository_read_write_access_arns = [
    module.eks.cluster_iam_role_arn
  ]

  tags = local.tags
}

################################################################################
# S3 Bucket for Application Uploads
################################################################################

resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads"

  tags = local.tags
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "transition_old_files"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }
  }
}

################################################################################
# CloudWatch Log Groups
################################################################################

resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/eks/${local.cluster_name}/application"
  retention_in_days = var.environment == "production" ? 90 : 30

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "alb" {
  name              = "/aws/alb/${local.name}"
  retention_in_days = var.environment == "production" ? 90 : 30

  tags = local.tags
}

################################################################################
# IAM Roles for EKS Service Accounts
################################################################################

# Admin Server IAM Role (for S3 access)
module "admin_server_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${local.name}-admin-server"

  role_policy_arns = {
    s3_access = aws_iam_policy.s3_upload_access.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["insightserenity:admin-server"]
    }
  }

  tags = local.tags
}

# Customer Services IAM Role
module "customer_services_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${local.name}-customer-services"

  role_policy_arns = {
    s3_access = aws_iam_policy.s3_upload_access.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["insightserenity:customer-services"]
    }
  }

  tags = local.tags
}

# S3 Upload Policy
resource "aws_iam_policy" "s3_upload_access" {
  name        = "${local.name}-s3-upload-access"
  description = "Allow services to upload files to S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:GetObjectAcl",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.uploads.arn,
          "${aws_s3_bucket.uploads.arn}/*"
        ]
      }
    ]
  })
}

################################################################################
# AWS Load Balancer Controller (for Kubernetes Ingress)
################################################################################

module "aws_load_balancer_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "${local.name}-aws-load-balancer-controller"

  attach_load_balancer_controller_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:aws-load-balancer-controller"]
    }
  }

  tags = local.tags
}

# Install AWS Load Balancer Controller via Helm
resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = "1.6.2"

  set {
    name  = "clusterName"
    value = module.eks.cluster_name
  }

  set {
    name  = "serviceAccount.create"
    value = "true"
  }

  set {
    name  = "serviceAccount.name"
    value = "aws-load-balancer-controller"
  }

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.aws_load_balancer_controller_irsa.iam_role_arn
  }

  depends_on = [module.eks]
}

################################################################################
# Outputs
################################################################################

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_security_group_id" {
  description = "Security group ID attached to the EKS cluster"
  value       = module.eks.cluster_security_group_id
}

output "elasticache_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.cluster_cache_nodes[0].address
}

output "elasticache_port" {
  description = "ElastiCache Redis port"
  value       = module.elasticache.cluster_cache_nodes[0].port
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "s3_uploads_bucket" {
  description = "S3 bucket for application uploads"
  value       = aws_s3_bucket.uploads.id
}

output "ecr_repositories" {
  description = "ECR repository URLs"
  value = {
    for k, v in module.ecr : k => v.repository_url
  }
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "acm_certificate_arn" {
  description = "ARN of ACM certificate"
  value       = aws_acm_certificate.main.arn
}

output "admin_server_role_arn" {
  description = "IAM role ARN for admin-server service account"
  value       = module.admin_server_irsa.iam_role_arn
}

output "customer_services_role_arn" {
  description = "IAM role ARN for customer-services service account"
  value       = module.customer_services_irsa.iam_role_arn
}
