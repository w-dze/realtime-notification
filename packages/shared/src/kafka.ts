/** Kafka topic and consumer-group constants shared across services. */
export const KAFKA_TOPIC_USER_ACTIVITY = "user.activity";

/** Tuned default for portfolio demos — balance parallelism vs broker overhead. */
export const KAFKA_TOPIC_PARTITIONS = 6;

/** Alternate partition count for load-test A/B (see scripts/load/TUNING.md). */
export const KAFKA_TOPIC_PARTITIONS_ALT = 3;

export const KAFKA_CONSUMER_GROUP_WORKERS = "notification-workers";
export const KAFKA_CONSUMER_GROUP_DOWNSTREAM = "downstream-analytics";

export function activityPartitionKey(userId: string): string {
  return userId;
}
