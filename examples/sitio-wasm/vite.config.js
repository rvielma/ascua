// Vite aquí es solo el dev server y el copiador de estáticos.
//
// El HTML lo genera Rust (`./build.sh`), el WASM lo produce cargo, y la
// reactividad no pasa por aquí en ningún momento. Si mañana hay que cambiar de
// herramienta, se cambia esta línea y el sitio sigue igual.
export default {
  server: { port: 5178, open: false },
  build: { outDir: "dist", emptyOutDir: true },
};
