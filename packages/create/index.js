#!/usr/bin/env node
/**
 * create-ascua: de un directorio vacío a un sitio de Ascua.
 *
 *   npm create ascua@latest my-site
 *   stil dlx create-ascua my-site
 *   deno run -A npm:create-ascua my-site
 *
 * Sin dependencias: copia una plantilla y escribe el `package.json` con las
 * versiones de Ascua que se publicaron junto con este paquete.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const AQUI = fileURLToPath(new URL(".", import.meta.url));
export const PLANTILLAS = ["static", "server"];

/** Los paquetes de Ascua que usa un sitio, por su carpeta en el repositorio. */
const PAQUETES = { ascua: "runtime", "vite-plugin-ascua": "vite-plugin" };

/** Las versiones de los paquetes vecinos, cuando esto corre dentro del repositorio. */
export function versionesDelRepositorio() {
  const salida = {};
  for (const [nombre, carpeta] of Object.entries(PAQUETES)) {
    salida[nombre] = JSON.parse(readFileSync(join(AQUI, "..", carpeta, "package.json"), "utf8")).version;
  }
  return salida;
}

/** Las de `versions.json`, que se escribe al publicar; en el repositorio, las vecinas. */
function versiones() {
  const archivo = join(AQUI, "versions.json");
  return existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")) : versionesDelRepositorio();
}

const español = /^es/i.test(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "");
const t = (es, en) => (español ? es : en);

const AYUDA = t(
  `Uso: create-ascua [directorio] [--template static|server]

  static  (por defecto) un sitio estático: una página HTML por ruta, islas donde haga falta
  server  un sitio con servidor: formularios con acciones, middleware, cookies firmadas`,
  `Usage: create-ascua [directory] [--template static|server]

  static  (default) a static site: one HTML page per route, islands where needed
  server  a site with a server: form actions, middleware, signed cookies`,
);

/** `["my-site", "--template", "server"]` → `{ dir: "my-site", template: "server" }`. */
export function leerArgumentos(argv) {
  const salida = { dir: undefined, template: undefined, ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") salida.ayuda = true;
    else if (a === "-t" || a === "--template") salida.template = argv[++i];
    else if (a.startsWith("--template=")) salida.template = a.slice("--template=".length);
    else if (!a.startsWith("-") && salida.dir === undefined) salida.dir = a;
    else throw new Error(t(`opción desconocida: ${a}`, `unknown option: ${a}`));
  }
  if (salida.template !== undefined && !PLANTILLAS.includes(salida.template)) {
    throw new Error(t(`la plantilla es static o server, no «${salida.template}»`, `template must be static or server, not "${salida.template}"`));
  }
  return salida;
}

/**
 * Copia una carpeta escribiendo cada archivo de nuevo, con los permisos de un
 * archivo recién creado. `cpSync` conserva los del origen, y un gestor como
 * stil guarda los paquetes de solo lectura: el sitio nuevo saldría sin poder
 * editarse.
 */
function copiar(origen, destino) {
  mkdirSync(destino, { recursive: true });
  for (const nombre of readdirSync(origen)) {
    const de = join(origen, nombre);
    const a = join(destino, nombre);
    if (statSync(de).isDirectory()) copiar(de, a);
    else writeFileSync(a, readFileSync(de));
  }
}

/** El `package.json` del sitio nuevo. */
function paqueteDe(nombre, plantilla, v) {
  const scripts = { dev: "vite", build: "vite build" };
  if (plantilla === "server") scripts.start = "node dist/server/index.mjs";
  else scripts.preview = "vite preview";
  return {
    name: nombre,
    private: true,
    type: "module",
    scripts,
    dependencies: { ascua: `^${v.ascua}` },
    devDependencies: {
      typescript: "^7.0.2",
      vite: "^8.3.0",
      "vite-plugin-ascua": `^${v["vite-plugin-ascua"]}`,
    },
  };
}

/**
 * Crea el sitio en `destino`. La plantilla `server` es la base más lo suyo,
 * encima. `idioma` es el del sitio —`<html lang>` y los mensajes del kit, como
 * los de validación—; por defecto, el de quien lo crea. Devuelve los archivos
 * escritos, relativos a `destino`.
 */
export function crear(destino, plantilla = "static", idioma = español ? "es" : "en") {
  if (existsSync(destino) && readdirSync(destino).length > 0) {
    throw new Error(t(`${destino} ya existe y no está vacío`, `${destino} already exists and is not empty`));
  }
  mkdirSync(destino, { recursive: true });
  const plantillas = join(AQUI, "templates");
  copiar(join(plantillas, "base"), destino);
  if (plantilla === "server") copiar(join(plantillas, "server"), destino);
  // npm no publica un `.gitignore`: viaja como `_gitignore`.
  if (existsSync(join(destino, "_gitignore"))) renameSync(join(destino, "_gitignore"), join(destino, ".gitignore"));
  // El idioma, en el esqueleto y en la opción del kit.
  const esqueleto = join(destino, "index.html");
  writeFileSync(esqueleto, readFileSync(esqueleto, "utf8").replace('<html lang="en">', `<html lang="${idioma}">`));
  const config = join(destino, "vite.config.ts");
  writeFileSync(
    config,
    readFileSync(config, "utf8")
      .replace("site: true", `site: { lang: "${idioma}" }`)
      .replace('site: { mode: "server" }', `site: { mode: "server", lang: "${idioma}" }`),
  );
  const nombre = basename(resolve(destino)).toLowerCase().replace(/[^a-z0-9-~._]/g, "-");
  writeFileSync(join(destino, "package.json"), `${JSON.stringify(paqueteDe(nombre, plantilla, versiones()), null, 2)}\n`);
  return readdirSync(destino, { recursive: true }).map(String).sort();
}

/** Cómo se instala y se arranca, con el gestor que corrió esto. */
function pasos(dir) {
  const agente = process.env.npm_config_user_agent ?? "";
  const gestor = process.versions.deno ? "deno" : /^(\w+)\//.exec(agente)?.[1];
  const [instalar, correr] =
    gestor === "deno"
      ? ["deno install", "deno task dev"]
      : gestor === "bun"
        ? ["bun install", "bun run dev"]
        : gestor === "pnpm"
          ? ["pnpm install", "pnpm dev"]
          : gestor === "yarn"
            ? ["yarn", "yarn dev"]
            : gestor === "stil"
              ? ["stil install", "stil run dev"]
              : ["npm install", "npm run dev"];
  return [`cd ${dir}`, instalar, correr];
}

async function preguntar(texto, porDefecto) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${texto} (${porDefecto}) `)).trim() || porDefecto;
  } finally {
    rl.close();
  }
}

async function main(argv) {
  let opciones;
  try {
    opciones = leerArgumentos(argv);
  } catch (error) {
    console.error(`create-ascua: ${error.message}\n\n${AYUDA}`);
    process.exit(1);
  }
  if (opciones.ayuda) {
    console.log(AYUDA);
    return;
  }
  const interactivo = process.stdin.isTTY && process.stdout.isTTY;
  let { dir, template } = opciones;
  if (!dir) dir = interactivo ? await preguntar(t("¿Dónde lo creo?", "Where should it go?"), "my-site") : "my-site";
  if (!template) {
    template = interactivo
      ? await preguntar(t("¿Plantilla? static o server", "Template? static or server"), "static")
      : "static";
    if (!PLANTILLAS.includes(template)) {
      console.error(t(`create-ascua: la plantilla es static o server`, `create-ascua: template must be static or server`));
      process.exit(1);
    }
  }
  try {
    crear(dir, template);
  } catch (error) {
    console.error(`create-ascua: ${error.message}`);
    process.exit(1);
  }
  console.log(`\n${t("Listo", "Done")}: ${dir} (${template})\n`);
  for (const paso of pasos(dir)) console.log(`  ${paso}`);
  console.log(`\n${t("Guía", "Guide")}: https://ascua.gitweave.run/docs/sitios/\n`);
}

/** ¿Se está ejecutando este archivo? `npm create` lo llama por un enlace de `.bin`. */
function esElComando() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Como comando, y no al importarlo desde los tests.
if (esElComando()) await main(process.argv.slice(2));
