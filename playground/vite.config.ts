import ascua from "vite-plugin-ascua";

export default {
  base: "./",
  plugins: [ascua()],
  resolve: {
    alias: {
      "ascua": new URL("../packages/runtime/src/index.ts", import.meta.url).pathname,
      "ascua-compilador/web": new URL(
        "../packages/compilador/web/ascua_compilador.js",
        import.meta.url,
      ).pathname,
    },
  },
  build: { minify: "terser", target: "es2022" },
};
