# Realtime Notification Service

Portfolio-grade **Node.js + TypeScript** service that streams user activity through **Kafka**, applies **Redis-cached preferences**, and delivers events to clients over **SSE**. Local stack via **Docker Compose**; cluster manifests with **Kubernetes HPA**; AWS path is **EC2 (k3s) behind an ALB** (not EKS); **k6** load tests include partition / eviction tuning notes.

```text
Clients ──POST /v1/activity──► API ──produce──► Kafka (user.activity, 6 partitions)
             │                   │                    │
             │                   │ Redis prefs        ├─► Worker (notification-workers)
             │                   │                    │      │ prefs lookup → filter
             │                   │                    │      └─► POST /internal/notify
             └─GET /v1/stream ◄── SSE hub ◄───────────┘
                                                      └─► subscriber-stub (downstream-analytics)
```

## Resume bullet → proof map

| Resume bullet | Where / how to prove |
|---|---|
| Node.js real-time notification service streaming user activity via Kafka to downstream subscribers | `services/api` produces to `user.activity`; `services/worker` + `services/subscriber-stub` consume with distinct groups |
| Redis cache for user preferences | `services/api` GET/PUT `/v1/users/:id/preferences`; keys `prefs:{userId}`; Redis `--maxmemory-policy allkeys-lru` in Compose |
| Docker + Kubernetes with HPA | `deploy/docker/docker-compose.yml`; `deploy/k8s/*` including `hpa.yaml` (CPU 60%, min 2 / max 10) |
| AWS EC2 behind ALB | `deploy/terraform` — VPC, EC2 user-data installs k3s, ALB → NodePort `30080` |
| Load tests with Kafka partition / Redis eviction tuning | `scripts/load/activity-sse.js` + `scripts/load/TUNING.md` |

## Exact layout

```text
/
  packages/shared/          # event schemas, types, validation
  services/api/             # Fastify: ingest, prefs, SSE hub
  services/worker/          # Kafka consumer → preference-aware notify
  services/subscriber-stub/ # downstream Kafka subscriber
  deploy/docker/            # Dockerfiles + compose + topic seed
  deploy/k8s/               # Deployment, Service, HPA, ConfigMaps
  deploy/terraform/         # AWS EC2 + ALB + security groups
  scripts/load/             # k6 scenarios + tuning notes
  scripts/smoke.sh          # compose e2e smoke
  README.md
```

## Quickstart (Docker Compose)

```bash
# from repo root
docker compose -f deploy/docker/docker-compose.yml up --build
```

In another terminal:

```bash
./scripts/smoke.sh
# or manually:
curl -N 'http://localhost:3000/v1/stream?userId=demo' -H 'x-user-id: demo'
curl -X POST http://localhost:3000/v1/activity \
  -H 'content-type: application/json' \
  -d '{"userId":"demo","type":"order.placed","payload":{"id":"1"}}'
```

Change preferences without restart — delivery updates immediately:

```bash
curl -X PUT http://localhost:3000/v1/users/demo/preferences \
  -H 'content-type: application/json' \
  -d '{"channels":["sse"],"mutedTypes":["order.placed"],"quietHours":null}'
```

## Local npm (unit tests / typecheck)

Requires Node 20+.

```bash
npm install
npm run build
npm run typecheck
npm test
```

## API surface

| Method | Path | Notes |
|---|---|---|
| `POST` | `/v1/activity` | Validate → Kafka produce → `202` |
| `GET`/`PUT` | `/v1/users/:id/preferences` | Redis write-through; miss seeds defaults |
| `GET` | `/v1/stream?userId=` | SSE subscription (demo auth: `x-user-id`) |
| `POST` | `/internal/notify` | Worker → in-process SSE fanout |
| `GET` | `/healthz` | Liveness |
| `GET` | `/readyz` | Kafka + Redis readiness |

## Kubernetes

```bash
kubectl apply -k deploy/k8s
kubectl get hpa -n realtime-notification
```

HPA targets the API Deployment at **60% CPU**, **min 2 / max 10**. Build/push images tagged `realtime-notification/api:latest` and `realtime-notification/worker:latest` (or retarget the manifests).

## AWS EC2 + ALB (Terraform)

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply
terraform output alb_dns_name
terraform output ssh_hints
```

See [`deploy/terraform/README.md`](deploy/terraform/README.md). **This is EC2 + k3s + ALB, not EKS.**

## Load tests (k6)

```bash
k6 run -e BASE_URL=http://localhost:3000 -e VUS=20 -e DURATION=30s scripts/load/activity-sse.js
```

Partition count (3 vs 6) and Redis eviction swaps: [`scripts/load/TUNING.md`](scripts/load/TUNING.md).

Worker structured logs include `prefs_lookup_ms` and `end_to_end_ms` for tuning visibility.

## Out of scope

- Real push/email providers (channels are modeled; SSE is implemented)
- Auth beyond demo `x-user-id`
- Full CI / secrets manager

## License

MIT (demo / portfolio)
