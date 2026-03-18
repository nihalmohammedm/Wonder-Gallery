import { createRouter, createWebHistory } from "vue-router";
import AdminView from "./views/AdminView.vue";
import GuestView from "./views/GuestView.vue";
import GalleryView from "./views/GalleryView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "admin-home",
      component: AdminView,
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminView,
    },
    {
      path: "/admin/galleries/:galleryId",
      name: "admin-gallery",
      component: AdminView,
      props: true,
    },
    {
      path: "/g/:slug",
      name: "guest",
      component: GuestView,
      props: true,
    },
    {
      path: "/g/:slug/all",
      name: "gallery",
      component: GalleryView,
      props: true,
    },
  ],
});

export default router;
