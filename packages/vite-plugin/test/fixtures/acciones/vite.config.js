import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

export const alias = [
  { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
  { find: /^ascua\/server$/, replacement: paquete("runtime/src/server.ts") },
  { find: /^vite-plugin-ascua\/site$/, replacement: paquete("vite-plugin/sitio-comun.js") },
];

export default {
  plugins: [ascua({ site: { mode: "server", security: { csp: { "img-src": ["https://cdn.ejemplo.cl"] } } } })],
  resolve: { alias },
  build: { target: "es2022" },
};
