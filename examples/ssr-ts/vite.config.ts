import ascua from "vite-plugin-ascua";

const paquete = (ruta: string) => new URL(`../../packages/${ruta}`, import.meta.url).pathname;

export default {
  plugins: [ascua()],
  resolve: {
    // Con expresiones y no con claves: `ascua` como clave también
    // capturaría `ascua/server`.
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/server$/, replacement: paquete("runtime/src/server.ts") },
    ],
  },
  build: { minify: "terser", target: "es2022" },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
};
