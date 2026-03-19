import "dotenv/config";
import { Worker } from "bullmq";
import { ensureStore } from "../server/store.js";
import { getQueueNames, createWorkerRedisConnection } from "../server/utils/jobs.js";
import { runJobById } from "../server/utils/jobRunner.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = createWorkerRedisConnection(redisUrl);
const queues = getQueueNames();

await ensureStore();

const workers = Object.values(queues).map((queueName) =>
  new Worker(
    queueName,
    async (job) => runJobById(job.data.jobId),
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY || 2),
    },
  ),
);

for (const worker of workers) {
  worker.on("completed", (job) => {
    console.log(`[worker] completed ${job.name} ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] failed ${job?.name} ${job?.id}: ${error.message}`);
  });
}

console.log(`[worker] listening on ${Object.values(queues).join(", ")} via ${redisUrl}`);
