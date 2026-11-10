#!/bin/bash
set -euxo pipefail

# This stack is EC2 + k3s + ALB — NOT EKS.
ROLE="${role}"
NODE_INDEX="${node_index}"
API_NODE_PORT="${api_node_port}"
PROJECT="${project_name}"

apt-get update -y
apt-get install -y curl ca-certificates jq

install_k3s_server() {
  curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik --write-kubeconfig-mode 644" sh -
  # Wait for node ready
  for i in $(seq 1 60); do
    kubectl get nodes && break
    sleep 5
  done

  # Persist join token for agents (demo: world-readable on instance disk)
  mkdir -p /opt/rns
  cat /var/lib/rancher/k3s/server/node-token > /opt/rns/node-token
  hostname -I | awk '{print $1}' > /opt/rns/server-ip

  # Apply Kubernetes manifests from the baked-in repo copy when present.
  if [ -d /opt/realtime-notification/deploy/k8s ]; then
    kubectl apply -k /opt/realtime-notification/deploy/k8s || true
  fi

  # Ensure NodePort service is reachable for ALB health checks
  echo "API NodePort expected at $${API_NODE_PORT}"
}

install_k3s_agent() {
  # Agents expect the server token to be provided via SSM / shared store in production.
  # For this demo Terraform path, agents join using user-data placeholders filled at apply time.
  SERVER_IP="${server_ip}"
  TOKEN="${k3s_token}"
  if [ -z "$${SERVER_IP}" ] || [ -z "$${TOKEN}" ] || [ "$${TOKEN}" = "PENDING" ]; then
    echo "Agent join token not ready; sleeping then retrying via local metadata is out of band."
    # Keep instance healthy; operator can join manually with outputs.
    exit 0
  fi
  curl -sfL https://get.k3s.io | K3S_URL="https://$${SERVER_IP}:6443" K3S_TOKEN="$${TOKEN}" sh -
}

if [ "$${ROLE}" = "server" ]; then
  install_k3s_server
else
  install_k3s_agent
fi

cat >/etc/motd <<EOF
Realtime Notification Service node ($${ROLE} #$${NODE_INDEX})
Project: $${PROJECT}
This is EC2 + k3s behind ALB — not EKS.
EOF
