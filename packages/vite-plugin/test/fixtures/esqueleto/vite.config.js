import ascua from "../../../index.js";

const paquete = (ruta) => new URL(`../../../../${ruta}`, import.meta.url).pathname;

// Como Letra Muerta: el esqueleto en una subcarpeta y las rutas con otro nombre.
export default {
  plugins: [ascua({ site: { routes: "src/paginas", shell: "src/landing/esqueleto.html" } })],
  resolve: {
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/server$/, replacement: paquete("runtime/src/server.ts") },
    ],
  },
};
