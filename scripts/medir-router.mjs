// Mide el router empaquetado: crudo, minificado y gzip.
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../packages/router/dist-lib/", import.meta.url).pathname;
const archivo = readdirSync(dir).find((f) => f.endsWith(".js"));
const codigo = readFileSync(join(dir, archivo));

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
console.log(`@ascua/router  (${archivo})`);
console.log(`  minificado: ${kb(codigo.length)}`);
console.log(`  gzip:       ${kb(gzipSync(codigo, { level: 9 }).length)}`);
console.log(`  brotli:     ${kb(brotliCompressSync(codigo).length)}`);
