import ascua from "vite-plugin-ascua";

const paquete = (ruta: string) => new URL(`../../packages/${ruta}`, import.meta.url).pathname;

export default {
  // `site`: cada archivo de src/routes/ es una página, y `vite build` las
  // deja todas en dist/ como HTML.
  plugins: [ascua({ site: true })],
  resolve: {
    // Dentro del repositorio, los paquetes son los de packages/. Una
    // aplicación de verdad no necesita esto.
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/server$/, replacement: paquete("runtime/src/server.ts") },
    ],
  },
  build: { minify: "terser", target: "es2022" },
};
