import ascua from "vite-plugin-ascua";

export default {
  // Sin `bin`: compila con el módulo WebAssembly de ascua-compilador.
  plugins: [ascua()],
  resolve: {
    alias: {
      "ascua": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
      "ascua-router": new URL("../../packages/router/src/index.ts", import.meta.url).pathname,
    },
  },
  build: { minify: "terser", target: "es2022" },
};
