<template>
  <main class="shell">
    <section class="gallery-hero">
      <div class="gallery-hero-top">
        <div class="gallery-hero-copy">
          <p class="gallery-kicker">Personal Link</p>
          <h1>{{ gallery?.title || "Find Your Photos" }}</h1>
          <p class="gallery-caption">
            Upload or capture a selfie and the gallery will search the indexed event photos for your matching faces.
          </p>
        </div>
        <div class="gallery-actions">
          <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
          <RouterLink class="button button-primary" :to="`/g/${slug}/all`">Common Gallery</RouterLink>
        </div>
      </div>

      <div class="gallery-stat-grid">
        <article class="gallery-stat">
          <strong>{{ match?.photoCount || 0 }}</strong>
          <span>Matches Found</span>
        </article>
        <article class="gallery-stat">
          <strong>{{ diagnostics?.indexedPhotoCount || 0 }}</strong>
          <span>Indexed Photos</span>
        </article>
        <article class="gallery-stat">
          <strong>{{ diagnostics?.bestScore ?? "n/a" }}</strong>
          <span>Best Score</span>
        </article>
      </div>
    </section>

    <div class="gallery-board">
      <section class="panel">
        <div class="gallery-panel-title">
          <div>
            <p class="gallery-kicker">Step 1</p>
            <h2>Submit Selfie</h2>
          </div>
        </div>
        <p class="helper-copy">Camera access works on localhost or HTTPS. Upload if camera permissions are blocked.</p>
        <div class="camera-card">
          <video v-show="cameraMode === 'live'" ref="videoRef" autoplay playsinline muted class="camera-preview"></video>
          <img v-if="previewUrl" :src="previewUrl" alt="Captured selfie" class="camera-preview" />
          <div v-if="cameraMode === 'idle' && !previewUrl" class="camera-placeholder">
            Start the camera or upload an existing selfie.
          </div>
        </div>
        <div class="button-row">
          <button class="button button-secondary" type="button" @click="startCamera">Start Camera</button>
          <button class="button button-primary" type="button" :disabled="cameraMode !== 'live'" @click="captureSelfie">
            Capture Selfie
          </button>
          <label class="button button-secondary file-button">
            Upload Selfie
            <input hidden type="file" accept="image/*" @change="uploadSelfie" />
          </label>
        </div>
        <div class="status-card">{{ status }}</div>
      </section>

      <section class="panel">
        <div class="gallery-panel-title">
          <div>
            <p class="gallery-kicker">Step 2</p>
            <h2>Matching Results</h2>
          </div>
        </div>

        <div v-if="match" class="gallery-callout gallery-highlight">
          <h3>{{ match.photoCount }} matching photo{{ match.photoCount === 1 ? "" : "s" }} found</h3>
          <p>Best score: {{ match.bestScore }}. Match confidence: {{ match.confidence }}.</p>
        </div>

        <div v-if="match?.photos.length" class="gallery-grid">
          <article v-for="photo in match.photos" :key="photo.id" class="photo-card">
            <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
            <div>
              <h3>{{ photo.title }}</h3>
              <p>{{ formatDate(photo.capturedAt) }}</p>
              <p>Match score: {{ photo.matchScore }} ({{ photo.matchConfidence }} confidence)</p>
              <p><a :href="photo.driveLink" target="_blank" rel="noreferrer">Open original in Drive</a></p>
            </div>
          </article>
        </div>

        <div v-else class="empty-state gallery-results-empty">{{ emptyMessage }}</div>

        <div v-if="diagnostics" class="gallery-callout">
          <p class="gallery-kicker">Diagnostics</p>
          <div class="gallery-diagnostics">
            <span>Threshold: {{ diagnostics.threshold }}</span>
            <span>Gallery: {{ diagnostics.gallerySlug }}</span>
            <span>Indexed photos: {{ diagnostics.indexedPhotoCount }} / {{ diagnostics.photoCount }}</span>
            <span>Encoded faces scanned: {{ diagnostics.scannedRegionCount }}</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getPublicGallery, matchSelfie } from "../lib/api.js";

const props = defineProps({
  slug: {
    type: String,
    required: true,
  },
});

const gallery = ref(null);
const match = ref(null);
const diagnostics = ref(null);
const previewUrl = ref("");
const status = ref("Loading gallery...");
const emptyMessage = ref("No photos to show yet.");
const videoRef = ref(null);
const cameraMode = ref("idle");
let mediaStream;

onMounted(loadGallery);
onBeforeUnmount(stopCamera);

async function loadGallery() {
  try {
    const response = await getPublicGallery(props.slug);
    gallery.value = response.gallery;
    status.value = "Gallery loaded. Capture or upload a selfie to compare it against the synced event photos.";
    emptyMessage.value = "No photos to show yet.";
  } catch (error) {
    status.value = error.message;
    emptyMessage.value = "This gallery is not available.";
  }
}

async function startCamera() {
  try {
    stopCamera();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    });
    videoRef.value.srcObject = mediaStream;
    cameraMode.value = "live";
    previewUrl.value = "";
    status.value = "Camera ready. Capture a selfie when you are centered in frame.";
  } catch {
    status.value = "Unable to access the camera. Upload a selfie instead.";
  }
}

async function captureSelfie() {
  if (!videoRef.value || !gallery.value) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoRef.value.videoWidth || 720;
  canvas.height = videoRef.value.videoHeight || 960;
  const context = canvas.getContext("2d");
  context.drawImage(videoRef.value, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

  if (!blob) {
    status.value = "Unable to capture a selfie.";
    return;
  }

  previewUrl.value = URL.createObjectURL(blob);
  cameraMode.value = "idle";
  stopCamera();

  const formData = new FormData();
  formData.set("selfie", new File([blob], "selfie.jpg", { type: "image/jpeg" }));
  await submitMatch(formData);
}

async function uploadSelfie(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }

  previewUrl.value = URL.createObjectURL(file);
  stopCamera();

  const formData = new FormData();
  formData.set("selfie", file);
  await submitMatch(formData);
}

async function submitMatch(formData) {
  try {
    status.value = "Matching your selfie against the face encodings from the event photos...";
    const response = await matchSelfie(props.slug, formData);
    match.value = response.match;
    diagnostics.value = response.diagnostics || null;

    if (!response.match) {
      const parts = [];

      if (response.diagnostics?.photoCount === 0) {
        parts.push("No event photos are available in this gallery yet.");
      } else if (response.diagnostics?.indexedPhotoCount === 0) {
        parts.push("Photos exist, but none of them have been indexed for matching yet.");
      } else {
        parts.push("No confident photo match was found for this selfie.");
      }

      if (response.diagnostics?.bestScore != null) {
        parts.push(`Best score ${response.diagnostics.bestScore} did not pass ${response.diagnostics.threshold}.`);
      }

      if ((response.diagnostics?.indexedPhotoCount || 0) > 0) {
        parts.push("Use a clear front-facing selfie, and make sure the event photos have been synced from Drive recently.");
      }

      emptyMessage.value = parts.join(" ");
      status.value = "Match finished without a usable result.";
      return;
    }

    status.value = `${response.match.photoCount} photo${response.match.photoCount === 1 ? "" : "s"} matched your selfie.`;
  } catch (error) {
    match.value = null;
    diagnostics.value = null;
    emptyMessage.value = "Unable to process this selfie.";
    status.value = error.message;
  }
}

function stopCamera() {
  if (!mediaStream) {
    return;
  }

  mediaStream.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
}

function formatDate(value) {
  if (!value) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
</script>
