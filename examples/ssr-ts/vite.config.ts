import ascua from "vite-plugin-ascua";

const paquete = (ruta: string) => new URL(`../../packages/${ruta}`, import.meta.url).pathname;

export default {
  plugins: [ascua()],
  resolve: {
    // Con expresiones y no con claves: `ascua` como clave también
    // capturaría `ascua/servidor`.
    alias: [
      { find: /^ascua$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^ascua\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
    ],
  },
  build: { minify: "terser", target: "es2022" },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
};
