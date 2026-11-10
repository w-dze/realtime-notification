#!/usr/bin/env bash
# Create Kafka topic user.activity with the tuned partition count (default 6).
set -euo pipefail

BROKERS="${KAFKA_BROKERS:-kafka:9092}"
TOPIC="${KAFKA_TOPIC:-user.activity}"
PARTITIONS="${KAFKA_PARTITIONS:-6}"
REPLICATION="${KAFKA_REPLICATION:-1}"

echo "Waiting for Kafka at ${BROKERS}..."
for i in $(seq 1 60); do
  if /opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BROKERS}" --list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Creating topic ${TOPIC} partitions=${PARTITIONS} replication=${REPLICATION}"
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BROKERS}" \
  --create \
  --if-not-exists \
  --topic "${TOPIC}" \
  --partitions "${PARTITIONS}" \
  --replication-factor "${REPLICATION}"

/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BROKERS}" --describe --topic "${TOPIC}"
echo "Topic seed complete."
