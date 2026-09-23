import ascua from "@ascua/vite-plugin";

export default {
  base: "./",
  plugins: [ascua()],
  resolve: {
    alias: {
      "@ascua/runtime": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
    },
  },
  build: { target: "es2022" },
};
