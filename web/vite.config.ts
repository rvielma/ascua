import ascua from "@ascua/vite-plugin";
import type { Plugin, ViteDevServer } from "vite";

const paquete = (ruta: string) => new URL(`../packages/${ruta}`, import.meta.url).pathname;

/**
 * La documentación en desarrollo: cada petición a `/docs/…` se renderiza al
 * vuelo con el mismo generador que usa el build. Tocar un `.md` o el marco y
 * recargar basta.
 */
function documentacion(): Plugin {
  return {
    name: "ascua-docs",
    configureServer(servidor: ViteDevServer) {
      servidor.middlewares.use(async (peticion, respuesta, seguir) => {
        const camino = new URL(peticion.url ?? "/", "http://x").pathname;
        const esPagina = camino === "/docs" || (camino.startsWith("/docs/") && !/\.[a-z0-9]+$/i.test(camino));
        const esIndice = camino === "/docs/busqueda.js";
        if (!esPagina && !esIndice) return seguir();
        try {
          const docs = await servidor.ssrLoadModule("/docs/generar.ts");
          const cuerpo = esIndice ? await docs.busqueda() : await docs.renderizar(camino);
          if (cuerpo === null) return seguir();
          respuesta.setHeader("content-type", esIndice ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
          respuesta.end(cuerpo);
        } catch (error) {
          servidor.ssrFixStacktrace(error as Error);
          seguir(error);
        }
      });
    },
  };
}

export default {
  plugins: [ascua(), documentacion()],
  resolve: {
    // Con expresiones y no con claves: `@ascua/runtime` como clave también
    // capturaría `@ascua/runtime/servidor`.
    alias: [
      { find: /^@ascua\/runtime$/, replacement: paquete("runtime/src/index.ts") },
      { find: /^@ascua\/runtime\/servidor$/, replacement: paquete("runtime/src/servidor.ts") },
    ],
  },
  build: { minify: "terser", target: "es2022" },
};
