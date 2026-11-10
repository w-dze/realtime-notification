variable "aws_region" {
  description = "AWS region for the EC2+ALB demo cluster"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix for resources"
  type        = string
  default     = "rns"
}

variable "instance_type" {
  description = "EC2 instance type for k3s nodes"
  type        = string
  default     = "t3.medium"
}

variable "instance_count" {
  description = "Number of EC2 instances (k3s server + agents). Must be >= 2 for ALB multi-AZ demo."
  type        = number
  default     = 2
}

variable "key_name" {
  description = "Existing EC2 key pair name for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR allowed to SSH to nodes"
  type        = string
  default     = "0.0.0.0/0"
}

variable "api_node_port" {
  description = "NodePort exposed by the notification-api Service"
  type        = number
  default     = 30080
}
