import { getJob } from "./api.js";
import { getSupabaseBrowserClient } from "./auth.js";

export async function waitForJobResult({ jobId, scope = "public", onProgress, timeoutMs = 180000 }) {
  if (!jobId) {
    throw new Error("Job ID is required.");
  }

  const client = getSupabaseBrowserClient();
  const initial = await getJob(jobId, { scope });
  const initialJob = initial.job;

  if (isTerminalJobStatus(initialJob?.status)) {
    if (initialJob.status === "failed") {
      throw new Error(initialJob.error || "Job failed.");
    }

    return initialJob;
  }

  if (onProgress) {
    onProgress(initialJob);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let channel = null;
    let syncPromise = null;

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (channel) {
        client.removeChannel(channel);
      }
    }

    function complete(job) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (job.status === "failed") {
        reject(new Error(job.error || "Job failed."));
        return;
      }

      resolve(job);
    }

    async function syncLatestJob() {
      if (syncPromise) {
        return syncPromise;
      }

      syncPromise = getJob(jobId, { scope })
        .then((latest) => {
          const job = latest.job;

          if (onProgress) {
            onProgress(job);
          }

          if (isTerminalJobStatus(job?.status)) {
            complete(job);
          }

          return job;
        })
        .finally(() => {
          syncPromise = null;
        });

      return syncPromise;
    }

    timeoutId = setTimeout(async () => {
      try {
        const latestJob = await syncLatestJob();
        if (isTerminalJobStatus(latestJob?.status)) {
          return;
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
        return;
      }

      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Timed out while waiting for the background job to finish."));
      }
    }, timeoutMs);

    channel = client
      .channel(`jobs:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        async () => {
          try {
            await syncLatestJob();
          } catch (error) {
            if (!settled) {
              settled = true;
              cleanup();
              reject(error);
            }
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") {
          return;
        }

        try {
          await syncLatestJob();
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          }
        }
      });
  });
}

function isTerminalJobStatus(status) {
  return status === "completed" || status === "failed";
}
