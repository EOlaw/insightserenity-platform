# ============================================================================
# InsightSerenity Gateway Infrastructure - Terraform Configuration
# ============================================================================
# Description: Infrastructure as Code for API Gateway deployment
# Provider: Cloud-agnostic (AWS example, adaptable to GCP/Azure)
# Version: 1.0.0
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state storage (recommended for production)
  backend "s3" {
    bucket         = "insightserenity-terraform-state"
    key            = "gateway/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "InsightSerenity"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Component   = "Gateway"
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

# Get latest Ubuntu AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Get existing VPC (or create new one)
data "aws_vpc" "main" {
  count = var.create_vpc ? 0 : 1
  id    = var.vpc_id
}

# ============================================================================
# VPC and Networking (if creating new)
# ============================================================================

resource "aws_vpc" "main" {
  count = var.create_vpc ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  count = var.create_vpc ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_subnet" "public" {
  count = var.create_vpc ? length(var.availability_zones) : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-${var.availability_zones[count.index]}"
  }
}

resource "aws_route_table" "public" {
  count = var.create_vpc ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count = var.create_vpc ? length(aws_subnet.public) : 0

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# ============================================================================
# Security Groups
# ============================================================================

resource "aws_security_group" "gateway" {
  name        = "${var.project_name}-gateway-sg"
  description = "Security group for NGINX gateway servers"
  vpc_id      = var.create_vpc ? aws_vpc.main[0].id : var.vpc_id

  # HTTP
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH (restricted)
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  # VRRP (for keepalived)
  ingress {
    description = "VRRP"
    from_port   = 0
    to_port     = 0
    protocol    = "112"
    self        = true
  }

  # Prometheus metrics
  ingress {
    description = "NGINX Exporter"
    from_port   = 9113
    to_port     = 9113
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Egress (all)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-gateway-sg"
  }
}

# ============================================================================
# IAM Role for EC2 Instances
# ============================================================================

resource "aws_iam_role" "gateway" {
  name = "${var.project_name}-gateway-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-gateway-role"
  }
}

resource "aws_iam_role_policy_attachment" "gateway_ssm" {
  role       = aws_iam_role.gateway.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "gateway" {
  name = "${var.project_name}-gateway-profile"
  role = aws_iam_role.gateway.name
}

# ============================================================================
# Gateway EC2 Instances
# ============================================================================

resource "aws_instance" "gateway" {
  count = var.gateway_instance_count

  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.gateway_instance_type
  subnet_id              = var.create_vpc ? aws_subnet.public[count.index % length(aws_subnet.public)].id : var.subnet_ids[count.index]
  vpc_security_group_ids = [aws_security_group.gateway.id]
  iam_instance_profile   = aws_iam_instance_profile.gateway.name
  key_name               = var.key_pair_name

  user_data = templatefile("${path.module}/user-data.sh", {
    hostname        = "gateway-${count.index + 1}"
    environment     = var.environment
    is_master       = count.index == 0
    virtual_ip      = var.virtual_ip
    gateway_peers   = join(",", [for i in range(var.gateway_instance_count) : "10.0.1.${101 + i}"])
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = true
    encrypted             = true
  }

  tags = {
    Name = "${var.project_name}-gateway-${count.index + 1}"
    Role = count.index == 0 ? "master" : "backup"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================================
# Elastic IP for Gateway (Optional - if not using VIP)
# ============================================================================

resource "aws_eip" "gateway" {
  count = var.use_elastic_ip ? var.gateway_instance_count : 0

  domain   = "vpc"
  instance = aws_instance.gateway[count.index].id

  tags = {
    Name = "${var.project_name}-gateway-${count.index + 1}-eip"
  }
}

# ============================================================================
# Route53 DNS Records
# ============================================================================

resource "aws_route53_record" "gateway" {
  count = var.create_dns_records ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 60

  # Use Elastic IPs or instance public IPs
  records = var.use_elastic_ip ? aws_eip.gateway[*].public_ip : aws_instance.gateway[*].public_ip

  health_check_id = aws_route53_health_check.gateway[0].id
}

resource "aws_route53_health_check" "gateway" {
  count = var.create_dns_records ? 1 : 0

  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "${var.project_name}-gateway-health-check"
  }
}

# ============================================================================
# CloudWatch Alarms
# ============================================================================

resource "aws_cloudwatch_metric_alarm" "gateway_cpu" {
  count = var.gateway_instance_count

  alarm_name          = "${var.project_name}-gateway-${count.index + 1}-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Gateway instance CPU usage is above 80%"
  alarm_actions       = var.sns_topic_arn != "" ? [var.sns_topic_arn] : []

  dimensions = {
    InstanceId = aws_instance.gateway[count.index].id
  }
}

resource "aws_cloudwatch_metric_alarm" "gateway_status" {
  count = var.gateway_instance_count

  alarm_name          = "${var.project_name}-gateway-${count.index + 1}-status-check"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Gateway instance has failed status checks"
  alarm_actions       = var.sns_topic_arn != "" ? [var.sns_topic_arn] : []

  dimensions = {
    InstanceId = aws_instance.gateway[count.index].id
  }
}

# ============================================================================
# Outputs
# ============================================================================

output "gateway_instance_ids" {
  description = "IDs of gateway instances"
  value       = aws_instance.gateway[*].id
}

output "gateway_public_ips" {
  description = "Public IP addresses of gateway instances"
  value       = var.use_elastic_ip ? aws_eip.gateway[*].public_ip : aws_instance.gateway[*].public_ip
}

output "gateway_private_ips" {
  description = "Private IP addresses of gateway instances"
  value       = aws_instance.gateway[*].private_ip
}

output "security_group_id" {
  description = "ID of gateway security group"
  value       = aws_security_group.gateway.id
}

output "dns_name" {
  description = "DNS name for gateway"
  value       = var.create_dns_records ? aws_route53_record.gateway[0].fqdn : null
}
