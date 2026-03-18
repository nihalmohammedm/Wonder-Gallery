import "dotenv/config";
import { createApp, syncAllConnectedGalleries } from "./app.js";
import { ensureStore } from "./store.js";

const port = Number(process.env.PORT || 3000);
const autoDriveSyncIntervalMs = getAutoDriveSyncIntervalMs();

await ensureStore();
const app = createApp();

app.listen(port, () => {
  console.log(`PicDrop API running on http://localhost:${port}`);
  if (autoDriveSyncIntervalMs > 0) {
    console.log(`Automatic Drive sync scheduled every ${Math.round(autoDriveSyncIntervalMs / (60 * 1000))} minute(s).`);
  }
});

if (autoDriveSyncIntervalMs > 0) {
  setInterval(() => {
    void runAutomaticDriveSync();
  }, autoDriveSyncIntervalMs);
}

async function runAutomaticDriveSync() {
  try {
    const result = await syncAllConnectedGalleries();
    console.log(
      JSON.stringify(
        {
          automaticDriveSync: true,
          ranAt: new Date().toISOString(),
          ...result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          automaticDriveSync: true,
          ranAt: new Date().toISOString(),
          ok: false,
          error: error.message || "Automatic Drive sync failed",
        },
        null,
        2,
      ),
    );
  }
}

function getAutoDriveSyncIntervalMs() {
  const minutes = Number(process.env.AUTO_DRIVE_SYNC_INTERVAL_MINUTES || 60);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }

  return Math.floor(minutes * 60 * 1000);
}
