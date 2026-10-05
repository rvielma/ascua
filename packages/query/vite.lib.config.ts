// Solo para medir: empaqueta ascua-query como librería y minifica.
export default {
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "ascua-query" },
    outDir: "dist-lib",
    emptyOutDir: true,
    minify: "terser",
    target: "es2022",
    rollupOptions: { external: ["ascua"] },
  },
};
