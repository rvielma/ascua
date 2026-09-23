import ascua from "@ascua/vite-plugin";

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
      "@ascua/runtime": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
      "@ascua/router": new URL("../../packages/router/src/index.ts", import.meta.url).pathname,
      "@ascua/testing": new URL("../../packages/testing/src/index.ts", import.meta.url).pathname,
    },
  },
};
