/**
 * Servidor HTTP del ejemplo: Node a secas, sin Express.
 *
 * En desarrollo, Vite va como middleware: compila al vuelo, recarga los
 * módulos del servidor con `ssrLoadModule` y sirve los del cliente con HMR.
 * En producción (`NODE_ENV=production`), sirve `dist/cliente` tal cual y
 * renderiza con el bundle de `dist/servidor`.
 *
 *   stil run dev      # http://localhost:5173
 *   stil run build && stil run start
 */

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const produccion = process.env.NODE_ENV === "production";
const puerto = Number(process.env.PORT ?? 5173);
const raiz = new URL(".", import.meta.url).pathname;

const TIPOS = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

let vite;
let plantillaProduccion;
let renderProduccion;

if (produccion) {
  plantillaProduccion = await readFile(join(raiz, "dist/cliente/index.html"), "utf8");
  ({ render: renderProduccion } = await import("./dist/servidor/entrada-servidor.js"));
} else {
  const { createServer: crearVite } = await import("vite");
  vite = await crearVite({ root: raiz, server: { middlewareMode: true }, appType: "custom" });
}

createServer((peticion, respuesta) => {
  const fallar = (error) => {
    vite?.ssrFixStacktrace(error);
    console.error(error);
    respuesta.statusCode = 500;
    respuesta.end(produccion ? "Error interno" : String(error.stack ?? error));
  };
  const pagina = () => renderizar(peticion, respuesta).catch(fallar);

  if (vite) vite.middlewares(peticion, respuesta, pagina);
  else estatico(peticion, respuesta).then((servido) => servido || pagina(), fallar);
}).listen(puerto, () => {
  console.log(`ascua ssr (${produccion ? "producción" : "desarrollo"}): http://localhost:${puerto}`);
});

async function renderizar(peticion, respuesta) {
  const url = peticion.url ?? "/";

  let plantilla = plantillaProduccion;
  let render = renderProduccion;
  if (vite) {
    // En desarrollo se relee en cada petición: así los cambios en el HTML o
    // en los componentes del servidor se ven al recargar, sin reiniciar.
    plantilla = await vite.transformIndexHtml(url, await readFile(join(raiz, "index.html"), "utf8"));
    ({ render } = await vite.ssrLoadModule("/src/entrada-servidor.ts"));
  }

  const { html, css, titulo, estado } = render(url);
  respuesta.statusCode = estado;
  respuesta.setHeader("content-type", "text/html; charset=utf-8");
  // Con funciones y no con texto: `replace` interpreta `$&` o `$'` en el
  // texto de reemplazo, y una página que los contenga saldría rota.
  respuesta.end(
    plantilla
      .replace("<!--titulo-->", () => titulo)
      .replace("<!--estilos-->", () => (css ? `<style>${css}</style>` : ""))
      .replace("<!--app-->", () => html),
  );
}

/** Los archivos de `dist/cliente`, menos el index.html, que es plantilla. */
async function estatico(peticion, respuesta) {
  const ruta = decodeURIComponent(new URL(peticion.url ?? "/", "http://x").pathname);
  if (ruta === "/" || ruta.endsWith(".html")) return false;

  const archivo = normalize(join(raiz, "dist/cliente", ruta));
  if (!archivo.startsWith(join(raiz, "dist/cliente"))) return false;
  try {
    if (!(await stat(archivo)).isFile()) return false;
  } catch {
    return false;
  }

  respuesta.setHeader("content-type", TIPOS[extname(archivo)] ?? "application/octet-stream");
  // Lo que genera Vite lleva un hash en el nombre: se puede cachear para siempre.
  if (ruta.startsWith("/assets/")) respuesta.setHeader("cache-control", "public, max-age=31536000, immutable");
  createReadStream(archivo).pipe(respuesta);
  return true;
}
