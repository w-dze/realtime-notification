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

locals {
  # First instance is k3s server; remaining are agents.
  # Agent join token is typically filled on a second apply after reading server outputs,
  # or by manually joining. Demo user-data tolerates PENDING.
  k3s_token_placeholder = "PENDING"
}

resource "aws_instance" "nodes" {
  count                       = var.instance_count
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public[count.index % length(aws_subnet.public)].id
  vpc_security_group_ids      = [aws_security_group.nodes.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    role          = count.index == 0 ? "server" : "agent"
    node_index    = count.index
    api_node_port = var.api_node_port
    project_name  = var.project_name
    server_ip     = count.index == 0 ? "" : "SERVER_IP_PLACEHOLDER"
    k3s_token     = count.index == 0 ? "" : local.k3s_token_placeholder
  })

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name = "${var.project_name}-k3s-${count.index == 0 ? "server" : "agent"}-${count.index}"
    Role = count.index == 0 ? "k3s-server" : "k3s-agent"
  }
}

resource "aws_lb_target_group" "api" {
  name     = "${var.project_name}-api-tg"
  port     = var.api_node_port
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/healthz"
    port                = tostring(var.api_node_port)
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  tags = {
    Name = "${var.project_name}-api-tg"
  }
}

resource "aws_lb_target_group_attachment" "api" {
  count            = var.instance_count
  target_group_arn = aws_lb_target_group.api.arn
  target_id        = aws_instance.nodes[count.index].id
  port             = var.api_node_port
}

resource "aws_lb" "api" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = {
    Name = "${var.project_name}-alb"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
