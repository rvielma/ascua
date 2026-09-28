import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

// Lo mínimo del README: sin index.html y sin islas.
export default {
  plugins: [ascua({ sitio: true })],
  resolve: {
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
    ],
  },
};
