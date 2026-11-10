output "alb_dns_name" {
  description = "Public DNS name of the Application Load Balancer in front of API NodePorts"
  value       = aws_lb.api.dns_name
}

output "alb_url" {
  description = "HTTP URL for the notification API via ALB"
  value       = "http://${aws_lb.api.dns_name}"
}

output "instance_public_ips" {
  description = "Public IPs of EC2 k3s nodes"
  value       = aws_instance.nodes[*].public_ip
}

output "ssh_hints" {
  description = "SSH commands for each node (replace key path)"
  value = [
    for i, ip in aws_instance.nodes[*].public_ip :
    "ssh -i ~/.ssh/<your-key>.pem ubuntu@${ip}  # ${i == 0 ? "k3s-server" : "k3s-agent"}"
  ]
}

output "architecture_note" {
  description = "Deployment model reminder"
  value       = "This Terraform provisions EC2 instances running k3s with an ALB targeting API NodePorts. It is intentionally NOT Amazon EKS."
}

output "api_node_port" {
  value = var.api_node_port
}
