// Solo para medir: empaqueta el router como librería y minifica.
export default {
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "ascua-router" },
    outDir: "dist-lib",
    emptyOutDir: true,
    minify: "terser",
    target: "es2022",
    rollupOptions: { external: ["@ascua/runtime"] },
  },
};
