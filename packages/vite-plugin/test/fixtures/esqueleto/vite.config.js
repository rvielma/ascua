import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

// Como Letra Muerta: el esqueleto en una subcarpeta y las rutas con otro nombre.
export default {
  plugins: [ascua({ sitio: { rutas: "src/paginas", esqueleto: "src/landing/esqueleto.html" } })],
  resolve: {
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
    ],
  },
};
