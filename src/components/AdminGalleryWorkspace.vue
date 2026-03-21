<template>
  <section v-if="selectedGallery" class="space-y-6">
    <Card class="surface-panel overflow-hidden">
      <template #content>
        <div class="space-y-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-3">
              <p class="eyebrow">Selected Gallery</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <Button label="Edit Gallery" severity="secondary" outlined icon="pi pi-pencil" @click="onEditGallery(selectedGallery)" />
              <Button
                label="Delete Gallery"
                severity="danger"
                outlined
                icon="pi pi-trash"
                :loading="saving.deleteGalleryId === selectedGallery.id"
                @click="onDeleteGallery(selectedGallery)"
              />
              <Button
                :label="selectedGallery.hasDriveConnection ? 'Reconnect Drive' : 'Connect Drive'"
                icon="pi pi-link"
                :loading="saving.connectDriveId === selectedGallery.id"
                @click="onConnectDrive(selectedGallery)"
              />
              <Button
                label="Sync Drive"
                icon="pi pi-refresh"
                :loading="saving.syncGalleryId === selectedGallery.id"
                :disabled="!selectedGallery.hasDriveConnection"
                @click="onSyncDrive(selectedGallery)"
              />
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-3">
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Photos</p>
              <p class="mt-2 text-2xl font-semibold text-slate-950">{{ galleryPhotoCount }}</p>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Faces Indexed</p>
              <p class="mt-2 text-2xl font-semibold text-slate-950">{{ galleryFaceCount }}</p>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Drive Connected</p>
              <p class="mt-2 text-2xl font-semibold text-slate-950">{{ selectedGallery.hasDriveConnection ? "Yes" : "No" }}</p>
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-2">
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Personal URL</p>
              <p class="mt-2 break-all text-sm text-slate-700">{{ personalUrl(selectedGallery.slug) }}</p>
              <RouterLink :to="`/g/${selectedGallery.slug}`" class="mt-3 inline-block" target="_blank" rel="noreferrer">
                <Button label="Open" severity="secondary" outlined size="small" />
              </RouterLink>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Common URL</p>
              <p class="mt-2 break-all text-sm text-slate-700">{{ commonUrl(selectedGallery.slug) }}</p>
              <RouterLink :to="`/g/${selectedGallery.slug}/all`" class="mt-3 inline-block" target="_blank" rel="noreferrer">
                <Button label="Open" severity="secondary" outlined size="small" />
              </RouterLink>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Common PIN</p>
              <p class="mt-2 text-3xl font-semibold tracking-[0.4em] text-slate-950">{{ selectedGallery.commonAccessPin || "----" }}</p>
              <Button
                label="Refresh PIN"
                severity="secondary"
                outlined
                size="small"
                class="mt-3"
                :loading="saving.refreshPinGalleryId === selectedGallery.id"
                @click="onRefreshPin(selectedGallery)"
              />
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Drive Folders</p>
              <div class="mt-2 space-y-2">
                <a
                  v-for="(link, index) in selectedGallery.driveLinks || []"
                  :key="`${selectedGallery.id}-drive-${index}`"
                  :href="link"
                  target="_blank"
                  rel="noreferrer"
                  class="block break-all text-sm text-sky-700"
                >
                  {{ link }}
                </a>
              </div>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Personal Accent</p>
              <div class="mt-3 flex items-center gap-3">
                <span class="h-8 w-8 rounded-[10px] border border-slate-200" :style="{ backgroundColor: selectedGallery.personalAccentColor || '#0f5bd8' }"></span>
                <p class="text-sm font-medium text-slate-700">{{ selectedGallery.personalAccentColor || "#0f5bd8" }}</p>
              </div>
            </div>
            <div class="surface-muted p-4">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Common Accent</p>
              <div class="mt-3 flex items-center gap-3">
                <span class="h-8 w-8 rounded-[10px] border border-slate-200" :style="{ backgroundColor: selectedGallery.commonAccentColor || '#0f5bd8' }"></span>
                <p class="text-sm font-medium text-slate-700">{{ selectedGallery.commonAccentColor || "#0f5bd8" }}</p>
              </div>
            </div>
          </div>

          <div class="surface-muted p-4">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Header Image</p>
              </div>
              <input
                ref="headerImageInputRef"
                hidden
                type="file"
                accept="image/*"
                :disabled="saving.headerImageGalleryId === selectedGallery.id"
                @change="handleHeaderImageChange"
              />
              <Button
                :label="saving.headerImageGalleryId === selectedGallery.id ? 'Uploading...' : selectedGallery.headerImageUrl ? 'Replace Header Image' : 'Upload Header Image'"
                severity="secondary"
                outlined
                icon="pi pi-image"
                :loading="saving.headerImageGalleryId === selectedGallery.id"
                :disabled="saving.headerImageGalleryId === selectedGallery.id"
                @click="openHeaderImagePicker"
              />
            </div>
            <img
              v-if="selectedGallery.headerImageUrl"
              :src="selectedGallery.headerImageUrl"
              :alt="`${selectedGallery.title} header`"
              class="mt-4 h-48 w-full rounded-[10px] border border-slate-200 object-cover"
            />
          </div>
        </div>
      </template>
    </Card>

    <Card class="surface-panel">
      <template #content>
        <div class="space-y-6">
          <div class="space-y-2">
            <p class="eyebrow">Photo Sources</p>
            <h2 class="section-title">Manual photo entry</h2>
          </div>

          <form class="grid gap-4 md:grid-cols-2" @submit.prevent="onSubmitPhoto">
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700">Gallery</label>
              <Select v-model="photoForm.galleryId" :options="galleries" optionLabel="title" optionValue="id" placeholder="Select a gallery" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700">Photo label</label>
              <InputText v-model.trim="photoForm.title" required placeholder="Stage photo 014" />
            </div>
            <div class="space-y-2 md:col-span-2">
              <label class="text-sm font-medium text-slate-700">Google Drive file link</label>
              <InputText v-model.trim="photoForm.driveLink" required type="url" placeholder="https://drive.google.com/file/d/.../view" />
            </div>
            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700">Captured on</label>
              <InputText v-model="photoForm.capturedAt" type="date" />
            </div>
            <div class="md:col-span-2">
              <Button :label="saving.photo ? 'Adding Photo...' : 'Add Manual Photo'" :loading="saving.photo" type="submit" />
            </div>
          </form>
        </div>
      </template>
    </Card>

    <Card class="surface-panel">
      <template #content>
        <div class="space-y-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <p class="eyebrow">Gallery Images</p>
              <h2 class="section-title">{{ selectedGallery.title }}</h2>
            </div>
            <div v-if="galleryPhotoCount" class="flex flex-wrap gap-2">
              <Tag :value="`${galleryPhotoCount} image${galleryPhotoCount === 1 ? '' : 's'}`" severity="contrast" rounded />
              <Tag :value="`${galleryIndexedPhotoCount} indexed`" severity="info" rounded />
            </div>
          </div>

          <template v-if="visibleGalleryPhotos.length">
            <div class="gallery-grid">
              <button
                v-for="photo in visibleGalleryPhotos"
                :key="photo.id"
                class="relative"
                type="button"
                @click="onOpenPhoto(photo)"
              >
                <span
                  class="absolute top-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm shadow-sm"
                  :class="isPhotoIndexed(photo) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white/95 text-slate-500'"
                  :title="photoIndexLabel(photo)"
                  :aria-label="photoIndexLabel(photo)"
                >
                  <i :class="isPhotoIndexed(photo) ? 'pi pi-check' : 'pi pi-minus'" aria-hidden="true"></i>
                </span>
                <img :src="photo.storageImageUrl || photo.thumbnailUrl" :alt="photo.title" />
              </button>
            </div>
            <div v-if="showPagination" class="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm text-slate-500">{{ paginationSummary }}</p>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <Button
                  label="Previous"
                  severity="secondary"
                  outlined
                  icon="pi pi-angle-left"
                  :disabled="loadingGalleryPhotos || pagination.page <= 1"
                  @click="onChangePage(pagination.page - 1)"
                />
                <span class="text-sm font-medium text-slate-700">
                  Page {{ pagination.page }} of {{ pagination.totalPages }}
                </span>
                <Button
                  label="Next"
                  severity="secondary"
                  outlined
                  icon="pi pi-angle-right"
                  iconPos="right"
                  :disabled="loadingGalleryPhotos || pagination.page >= pagination.totalPages"
                  @click="onChangePage(pagination.page + 1)"
                />
              </div>
            </div>
          </template>
          <div v-else-if="loadingGalleryPhotos" class="flex justify-center py-2 text-sm text-slate-500">
            Loading images...
          </div>
          <div v-else-if="!galleryPhotoCount" class="surface-muted p-4 text-sm text-slate-500">
            No images are mapped to this gallery yet.
          </div>
        </div>
      </template>
    </Card>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import Button from "primevue/button";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Tag from "primevue/tag";

const props = defineProps({
  selectedGallery: { type: Object, default: null },
  selectedGalleryPhotos: { type: Array, default: () => [] },
  galleryPagination: {
    type: Object,
    default: () => ({
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    }),
  },
  loadingGalleryPhotos: { type: Boolean, default: false },
  galleries: { type: Array, default: () => [] },
  photoForm: { type: Object, required: true },
  saving: { type: Object, required: true },
  galleryPhotoCount: { type: Number, default: 0 },
  galleryFaceCount: { type: Number, default: 0 },
  galleryIndexedPhotoCount: { type: Number, default: 0 },
  personalUrl: { type: Function, required: true },
  commonUrl: { type: Function, required: true },
  onEditGallery: { type: Function, required: true },
  onDeleteGallery: { type: Function, required: true },
  onConnectDrive: { type: Function, required: true },
  onSyncDrive: { type: Function, required: true },
  onRefreshPin: { type: Function, required: true },
  onUploadHeaderImage: { type: Function, required: true },
  onSubmitPhoto: { type: Function, required: true },
  onOpenPhoto: { type: Function, required: true },
  onChangeGalleryPage: { type: Function, required: true },
});

const headerImageInputRef = ref(null);
const visibleGalleryPhotos = computed(() => props.selectedGalleryPhotos);
const pagination = computed(() => props.galleryPagination);
const showPagination = computed(() => pagination.value.totalPages > 1);
const paginationSummary = computed(() => {
  if (!pagination.value.totalItems) {
    return "No images available.";
  }

  const start = (pagination.value.page - 1) * pagination.value.pageSize + 1;
  const end = Math.min(start + visibleGalleryPhotos.value.length - 1, pagination.value.totalItems);
  return `Showing ${start}-${end} of ${pagination.value.totalItems} images`;
});

function openHeaderImagePicker() {
  headerImageInputRef.value?.click();
}

function handleHeaderImageChange(event) {
  if (!props.selectedGallery) {
    return;
  }

  props.onUploadHeaderImage(event, props.selectedGallery);
  event.target.value = "";
}

function isPhotoIndexed(photo) {
  if (typeof photo?.isIndexed === "boolean") {
    return photo.isIndexed;
  }

  return Number(photo?.faceCount) > 0;
}

function photoIndexLabel(photo) {
  return isPhotoIndexed(photo) ? "Indexed" : "Not indexed";
}

function onChangePage(page) {
  props.onChangeGalleryPage(page);
}
</script>
