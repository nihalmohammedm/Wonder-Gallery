<template>
  <div :class="wrapperClass" role="status" :aria-live="overlay ? 'polite' : 'off'">
    <ProgressSpinner strokeWidth="5" class="page-loader-spinner" />
  </div>
</template>

<script setup>
import { computed } from "vue";
import ProgressSpinner from "primevue/progressspinner";

const props = defineProps({
  overlay: {
    type: Boolean,
    default: true,
  },
});

const wrapperClass = computed(() => (props.overlay ? "page-loader-overlay" : "page-loader-inline"));
</script>
