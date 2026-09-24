import ascua from "vite-plugin-ascua";

export default {
  base: "./",
  plugins: [ascua()],
  resolve: {
    alias: {
      "ascua": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
    },
  },
  build: { target: "es2022" },
};
