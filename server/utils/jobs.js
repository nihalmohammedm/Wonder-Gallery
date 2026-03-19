import IORedis from "ioredis";
import { Queue } from "bullmq";

const queueNames = {
  gallerySync: "gallery-sync",
  photoIndex: "photo-index",
  faceMatch: "face-match",
};

let connection;
let queues;

function getRedisConnection() {
  if (connection) {
    return connection;
  }

  const config = useRuntimeConfig();
  connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return connection;
}

function getQueues() {
  if (queues) {
    return queues;
  }

  const redis = getRedisConnection();
  queues = {
    gallerySync: new Queue(queueNames.gallerySync, { connection: redis }),
    photoIndex: new Queue(queueNames.photoIndex, { connection: redis }),
    faceMatch: new Queue(queueNames.faceMatch, { connection: redis }),
  };

  return queues;
}

export function getQueueNames() {
  return queueNames;
}

export async function enqueueJobRecord(jobRecord) {
  const queueMap = getQueues();
  const queue = queueMap[toQueueKey(jobRecord.type)];

  if (!queue) {
    throw new Error(`Unsupported job type: ${jobRecord.type}`);
  }

  const bullJob = await queue.add(jobRecord.type, { jobId: jobRecord.id }, {
    jobId: jobRecord.id,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: 200,
    removeOnFail: 200,
  });

  return bullJob;
}

export function createWorkerRedisConnection(redisUrl) {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

function toQueueKey(type) {
  switch (type) {
    case "gallery_sync":
      return "gallerySync";
    case "photo_index":
      return "photoIndex";
    case "face_match":
      return "faceMatch";
    default:
      return "";
  }
}
