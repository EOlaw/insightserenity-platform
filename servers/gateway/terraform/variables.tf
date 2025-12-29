# ============================================================================
# Terraform Variables
# ============================================================================

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "insightserenity"
}

# VPC Configuration
variable "create_vpc" {
  description = "Whether to create a new VPC"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "Existing VPC ID (if create_vpc is false)"
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR block for VPC (if creating new)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_ids" {
  description = "List of subnet IDs for gateway instances (if not creating VPC)"
  type        = list(string)
  default     = []
}

variable "availability_zones" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# Gateway Configuration
variable "gateway_instance_count" {
  description = "Number of gateway instances (min 2 for HA)"
  type        = number
  default     = 2

  validation {
    condition     = var.gateway_instance_count >= 2
    error_message = "At least 2 gateway instances required for high availability"
  }
}

variable "gateway_instance_type" {
  description = "EC2 instance type for gateway"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "SSH key pair name"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

# Networking
variable "virtual_ip" {
  description = "Virtual IP for keepalived VRRP"
  type        = string
  default     = "10.0.1.100"
}

variable "use_elastic_ip" {
  description = "Whether to use Elastic IPs"
  type        = bool
  default     = true
}

# DNS Configuration
variable "create_dns_records" {
  description = "Whether to create Route53 DNS records"
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name for gateway"
  type        = string
  default     = "api.insightserenity.com"
}

# Monitoring
variable "sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = ""
}
