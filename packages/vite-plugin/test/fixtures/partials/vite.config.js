import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

export default {
  plugins: [ascua({ site: { partials: true } })],
  resolve: {
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/server$/, replacement: paquete("runtime/src/server.ts") },
      { find: /^vite-plugin-ascua\/site$/, replacement: paquete("vite-plugin/sitio-comun.js") },
      { find: /^vite-plugin-ascua\/partials$/, replacement: paquete("vite-plugin/partials.js") },
    ],
  },
  build: { target: "es2022" },
};
