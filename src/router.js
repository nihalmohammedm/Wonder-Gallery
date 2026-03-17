import { createRouter, createWebHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import AdminView from "./views/AdminView.vue";
import GuestView from "./views/GuestView.vue";
import GalleryView from "./views/GalleryView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminView,
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
