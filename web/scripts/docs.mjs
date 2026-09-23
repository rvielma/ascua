// Escribe la documentación en dist/docs/: una carpeta con su index.html por
// página, más el índice de la búsqueda. Corre después de `vite build`.
//
// Carga el generador a través de Vite para que pase por el mismo plugin que
// compila las plantillas: el marco de las páginas es Ascua.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createServer } from "vite";

const raiz = new URL("..", import.meta.url).pathname;
const vite = await createServer({ root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "error" });

try {
  const docs = await vite.ssrLoadModule("/docs/generar.ts");
  const paginas = await docs.todas();
  for (const [ruta, html] of paginas) {
    const carpeta = join(raiz, "dist", ruta);
    await mkdir(carpeta, { recursive: true });
    await writeFile(join(carpeta, "index.html"), html);
  }
  await writeFile(join(raiz, "dist/docs/busqueda.json"), await docs.busqueda());
  console.log(`  ${paginas.size} páginas de documentación`);
} finally {
  await vite.close();
}
