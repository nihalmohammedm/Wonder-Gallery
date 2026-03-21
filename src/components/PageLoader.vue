<template>
  <Teleport v-if="overlay" to="body">
    <div class="page-loader-overlay" role="status" aria-live="polite">
      <ProgressSpinner strokeWidth="5" class="page-loader-spinner" />
    </div>
  </Teleport>

  <div v-else class="page-loader-inline" role="status" aria-live="off">
    <ProgressSpinner strokeWidth="5" class="page-loader-spinner" />
  </div>
</template>

<script setup>
import ProgressSpinner from "primevue/progressspinner";

defineProps({
  overlay: {
    type: Boolean,
    default: true,
  },
});
</script>
