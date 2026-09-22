import ascua from "@ascua/vite-plugin";

export default {
  // Sin `bin`: compila con el módulo WebAssembly de @ascua/compilador.
  plugins: [ascua()],
  resolve: {
    alias: {
      "@ascua/runtime": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname,
      "@ascua/router": new URL("../../packages/router/src/index.ts", import.meta.url).pathname,
    },
  },
  build: { minify: "terser", target: "es2022" },
};
