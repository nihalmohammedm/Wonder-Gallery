<template>
  <main class="shell">
    <section class="gallery-hero">
      <div class="gallery-hero-top">
        <div class="gallery-hero-copy">
          <p class="gallery-kicker">Common Link</p>
          <h1>{{ gallery?.title || "Gallery" }}</h1>
          <p class="gallery-caption">
            A clean gallery wall for the full event archive. Open the personal link if you want the selfie-based matching flow instead.
          </p>
        </div>
        <div class="gallery-actions">
          <RouterLink class="button button-secondary" to="/">Overview</RouterLink>
          <RouterLink class="button button-primary" :to="`/g/${slug}`">Personal Link</RouterLink>
        </div>
      </div>

      <div class="gallery-stat-grid">
        <article class="gallery-stat">
          <strong>{{ photos.length }}</strong>
          <span>Total Photos</span>
        </article>
        <article class="gallery-stat">
          <strong>{{ photoYears }}</strong>
          <span>Captured Year{{ photoYears === 1 ? "" : "s" }}</span>
        </article>
        <article class="gallery-stat">
          <strong>{{ latestDate }}</strong>
          <span>Latest Capture</span>
        </article>
      </div>
    </section>

    <section class="gallery-strip">
      <div class="status-card">{{ status }}</div>
    </section>

    <section class="gallery-board">
      <aside class="gallery-callout">
        <p class="gallery-kicker">Browse</p>
        <h2>Event Collection</h2>
        <p>
          Every card opens the original Drive item. The gallery surface uses the synced backend copy when available and falls back to the Drive thumbnail otherwise.
        </p>
        <div class="gallery-pill-row">
          <span class="gallery-pill">Sky mode</span>
          <span class="gallery-pill">{{ photos.length }} image{{ photos.length === 1 ? "" : "s" }}</span>
        </div>
      </aside>

      <section class="panel">
        <div class="gallery-panel-title">
          <div>
            <p class="gallery-kicker">Photo Wall</p>
            <h2>All Images</h2>
          </div>
        </div>

        <div v-if="photos.length" class="gallery-grid">
          <article v-for="photo in photos" :key="photo.id" class="photo-card">
            <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
            <div>
              <h3>{{ photo.title }}</h3>
              <p>{{ formatDate(photo.capturedAt) }}</p>
              <p><a :href="photo.driveLink" target="_blank" rel="noreferrer">Open original in Drive</a></p>
            </div>
          </article>
        </div>
        <div v-else class="empty-state gallery-results-empty">{{ emptyMessage }}</div>
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { getPublicGalleryPhotos } from "../lib/api.js";

const props = defineProps({
  slug: {
    type: String,
    required: true,
  },
});

const gallery = ref(null);
const photos = ref([]);
const status = ref("Loading gallery...");
const emptyMessage = ref("No gallery images are available yet.");

const photoYears = computed(() => {
  const years = new Set(
    photos.value
      .map((photo) => (photo.capturedAt ? new Date(photo.capturedAt).getFullYear() : null))
      .filter(Boolean),
  );
  return years.size || 0;
});

const latestDate = computed(() => {
  const datedPhotos = photos.value.filter((photo) => photo.capturedAt).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  return datedPhotos[0] ? formatDate(datedPhotos[0].capturedAt) : "No date";
});

onMounted(loadGallery);

async function loadGallery() {
  try {
    const response = await getPublicGalleryPhotos(props.slug);
    gallery.value = response.gallery;
    photos.value = response.photos;
    status.value = `${response.photos.length} image${response.photos.length === 1 ? "" : "s"} available in this gallery.`;

    if (!response.photos.length) {
      emptyMessage.value = "This gallery does not have any mapped photos yet.";
    }
  } catch (error) {
    status.value = error.message;
    emptyMessage.value = "This gallery is not available.";
  }
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
