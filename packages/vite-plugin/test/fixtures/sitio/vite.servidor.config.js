import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

export default {
  plugins: [ascua({ sitio: { modo: "servidor" } })],
  resolve: {
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
      { find: /^vite-plugin-ascua\/sitio$/, replacement: paquete("vite-plugin/sitio-comun.js") },
    ],
  },
  build: { target: "es2022", outDir: "dist-srv/cliente" },
};
