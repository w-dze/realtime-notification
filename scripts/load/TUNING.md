# Load-test tuning notes

These knobs match the resume bullet about Kafka partition / Redis eviction tuning.

## Kafka partitions: 3 vs 6

Default topic seed uses **6 partitions** (`deploy/docker/seed-topic.sh`, `KAFKA_PARTITIONS`).

Compare:

```bash
# 6 partitions (default)
KAFKA_PARTITIONS=6 docker compose -f deploy/docker/docker-compose.yml up --build -d
k6 run -e BASE_URL=http://localhost:3000 -e VUS=20 -e DURATION=45s scripts/load/activity-sse.js

# Tear down and recreate topic with 3 partitions
docker compose -f deploy/docker/docker-compose.yml down -v
KAFKA_PARTITIONS=3 docker compose -f deploy/docker/docker-compose.yml up --build -d
k6 run -e BASE_URL=http://localhost:3000 -e VUS=20 -e DURATION=45s scripts/load/activity-sse.js
```

What to watch:

- Worker logs `prefs_lookup_ms` / `end_to_end_ms` and partition assignment
- k6 `activity_post_ms` p95
- Consumer lag if you scale workers below partition count

Rule of thumb for this demo: **partitions ≥ worker replicas** for parallel consume; 6 gives headroom for HPA-style worker growth, 3 is a tighter bottleneck for A/B.

## Redis eviction policy swaps

Compose Redis defaults to `allkeys-lru` with `maxmemory 128mb`.

```bash
# Baseline LRU
REDIS_MAXMEMORY_POLICY=allkeys-lru docker compose -f deploy/docker/docker-compose.yml up -d redis

# Compare noeviction (will error on OOM instead of evicting prefs)
REDIS_MAXMEMORY_POLICY=noeviction docker compose -f deploy/docker/docker-compose.yml up -d redis

# Or volatile-lru (only keys with TTL — prefs always have TTL so similar to allkeys-lru here)
REDIS_MAXMEMORY_POLICY=volatile-lru docker compose -f deploy/docker/docker-compose.yml up -d redis
```

Under synthetic preference churn (many unique userIds in k6), LRU keeps hot users warm while cold prefs reseed from defaults on miss — visible as `cached: false` on `GET /v1/users/:id/preferences`.

## Related flags

| Flag / env | Where | Effect |
|---|---|---|
| `KAFKA_PARTITIONS` | compose / seed | Topic partition count |
| `REDIS_MAXMEMORY_POLICY` | compose redis | Eviction algorithm |
| `PREFS_TTL_SECONDS` | api | Cache TTL |
| `NOTIFY_IDEMPOTENCY` | worker | Short-TTL dedupe keys |
| `VUS` / `DURATION` | k6 | Concurrency / length |
