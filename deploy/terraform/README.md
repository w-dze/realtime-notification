# AWS EC2 + ALB (not EKS)

This Terraform module provisions:

- VPC with 2 public subnets
- Security groups for ALB and k3s nodes
- 2+ Ubuntu EC2 instances with user-data installing **k3s**
- Application Load Balancer targeting API **NodePort 30080** across replicas

This is the portfolio path for “hosted on AWS EC2 behind an ALB”. It deliberately does **not** use EKS.

## Apply

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
# edit key_name + allowed_ssh_cidr
terraform init
terraform plan
terraform apply
```

## After apply

1. Note `alb_dns_name` and `ssh_hints` from outputs.
2. SSH to the k3s server, copy repo manifests (or bake them into the AMI / user-data path `/opt/realtime-notification`), then:

```bash
kubectl apply -k /opt/realtime-notification/deploy/k8s
```

3. Build/push images referenced by the Deployments, or load them onto the nodes for demos.
4. Hit the API through the ALB: `http://$(terraform output -raw alb_dns_name)/healthz`

## Joining agent nodes

The first instance is the k3s server. Agents may need a second-pass join using the server node-token (`/opt/rns/node-token`). For demos you can join manually:

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://<server-private-ip>:6443 K3S_TOKEN=<token> sh -
```
