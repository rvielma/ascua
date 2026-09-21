import ascua from "@ascua/vite-plugin";

export default {
  base: "./",
  plugins: [ascua()],
  resolve: {
    alias: {
      "@ascua/runtime": new URL("../packages/runtime/src/index.ts", import.meta.url).pathname,
      "@ascua/compilador/web": new URL(
        "../packages/compilador/web/ascua_compilador.js",
        import.meta.url,
      ).pathname,
    },
  },
  build: { minify: "terser", target: "es2022" },
};
