import ascua from "vite-plugin-ascua";

export default {
  // El mismo plugin que en el build: los tests tienen que ver las plantillas
  // compiladas, igual que el navegador.
  plugins: [ascua()],
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "ascua": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
      "ascua-router": new URL("../../packages/router/src/index.ts", import.meta.url).pathname,
      "ascua-testing": new URL("../../packages/testing/src/index.ts", import.meta.url).pathname,
    },
  },
};
