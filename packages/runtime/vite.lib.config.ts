// Solo para medir: empaqueta el runtime como librería y minifica.
export default {
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "ascua-runtime" },
    outDir: "dist-lib",
    emptyOutDir: true,
    minify: "terser",
    target: "es2022",
  },
};
