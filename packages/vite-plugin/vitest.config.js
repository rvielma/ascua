export default {
  test: {
    include: ["test/**/*.test.js"],
    // Los tests construyen un sitio de verdad con Vite: tardan más que uno
    // unitario.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Los mensajes para quien desarrolla siguen a `LANG`: los tests esperan
    // los de español, sea cual sea la máquina.
    env: { LANG: "es_CL.UTF-8" },
  },
  resolve: {
    // `form.js` importa el runtime; en el repositorio, el de packages/.
    alias: [{ find: /^ascua$/, replacement: new URL("../runtime/src/index.ts", import.meta.url).pathname }],
  },
};
