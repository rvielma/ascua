import { svelte } from "@sveltejs/vite-plugin-svelte";

export default {
  base: "./",
  plugins: [svelte()],
  build: { target: "es2022" },
};
