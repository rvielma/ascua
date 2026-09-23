import ascua from "@ascua/vite-plugin";

const paquete = (ruta: string) => new URL(`../../packages/${ruta}`, import.meta.url).pathname;

export default {
  plugins: [ascua()],
  resolve: {
    // Con expresiones y no con claves: `@ascua/runtime` como clave también
    // capturaría `@ascua/runtime/servidor`.
    alias: [
      { find: /^@ascua\/runtime$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^@ascua\/runtime\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
    ],
  },
  build: { minify: "terser", target: "es2022" },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
};
