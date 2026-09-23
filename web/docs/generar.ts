/**
 * La documentación: Markdown en `contenido/`, HTML estático a la salida.
 *
 * El marco de cada página —barra lateral, índice, anterior y siguiente— es una
 * plantilla de Ascua renderizada con `renderToString`: la documentación de
 * Ascua la genera el SSR de Ascua. El Markdown lo convierte `marked` y el
 * código lo colorea `shiki` al construir, así que al navegador no llega ni un
 * byte de resaltado.
 *
 * Lo usan dos sitios: el plugin de `vite.config.ts`, que sirve las páginas en
 * desarrollo, y `scripts/docs.mjs`, que las escribe en `dist/` al construir.
 */

import { readFile } from "node:fs/promises";

import { renderToString } from "@ascua/runtime/servidor";
import { Marked, type Tokens } from "marked";
import { createCssVariablesTheme, createHighlighter, type Highlighter } from "shiki";

import { INDICE, ORDEN, ruta, type Entrada } from "./indice.js";

const VERSION = "v0.1.0";
const CONTENIDO = new URL("./contenido/", import.meta.url);

interface Seccion {
  nivel: 2 | 3;
  titulo: string;
  id: string;
}

interface Documento {
  entrada: Entrada;
  titulo: string;
  descripcion: string;
  html: string;
  secciones: Seccion[];
  /** Texto plano por sección, para la búsqueda. */
  textos: { id: string; titulo: string; texto: string }[];
}

// ---------------------------------------------------------------------------
// Markdown

const tema = createCssVariablesTheme({ name: "ascua", variablePrefix: "--sk-", fontStyle: true });
let resaltador: Promise<Highlighter> | null = null;
const LENGUAJES = ["ts", "js", "sh", "html", "css", "json", "text"] as const;

function resaltar(): Promise<Highlighter> {
  resaltador ??= createHighlighter({ themes: [tema], langs: [...LENGUAJES] });
  return resaltador;
}

/** `Primeros pasos` → `primeros-pasos`; sin tildes, para que la URL se lea. */
export function aId(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textoPlano(html: string): string {
  return html
    .replace(/<\/?(?:code|strong|em|a|span|kbd)\b[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Separa la cabecera `---\nclave: valor\n---` del cuerpo. */
function cabecera(fuente: string): { datos: Record<string, string>; cuerpo: string } {
  const partes = /^---\n([\s\S]*?)\n---\n/.exec(fuente);
  if (!partes) return { datos: {}, cuerpo: fuente };
  const datos: Record<string, string> = {};
  for (const linea of partes[1]!.split("\n")) {
    const [clave, ...resto] = linea.split(":");
    if (clave && resto.length) datos[clave.trim()] = resto.join(":").trim();
  }
  return { datos, cuerpo: fuente.slice(partes[0].length) };
}

async function convertir(fuente: string) {
  const shiki = await resaltar();
  const secciones: Seccion[] = [];
  const usados = new Set<string>();

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Heading) {
        const html = this.parser.parseInline(token.tokens);
        if (token.depth === 1) return "";
        let id = aId(textoPlano(html));
        while (usados.has(id)) id += "-";
        usados.add(id);
        if (token.depth === 2 || token.depth === 3) {
          secciones.push({ nivel: token.depth, titulo: textoPlano(html), id });
        }
        return `<h${token.depth} id="${id}"><a class="ancla" href="#${id}" aria-hidden="true">#</a>${html}</h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const pedido = (token.lang ?? "").split(/\s/)[0] || "text";
        const lang = (LENGUAJES as readonly string[]).includes(pedido) ? pedido : "text";
        const html = shiki.codeToHtml(token.text, { lang, theme: "ascua" });
        const rotulo = pedido === "text" ? "" : `<span class="lenguaje">${escapar(pedido)}</span>`;
        return `<div class="codigo">${rotulo}${html}</div>\n`;
      },
      // `> **Nota:** …` es una nota, y `> **Cuidado:** …` un aviso.
      blockquote(this: { parser: { parse: (t: Tokens.Generic[]) => string } }, token: Tokens.Blockquote) {
        const html = this.parser.parse(token.tokens);
        const tipo = /^<p><strong>Cuidado/.test(html) ? "aviso" : "nota";
        return `<div class="recuadro ${tipo}">${html}</div>\n`;
      },
    },
  });

  // Las tablas van en un contenedor que se desplaza en pantallas estrechas,
  // en vez de desbordar la página.
  const html = (await marked.parse(fuente, { async: true }))
    .replace(/<table>/g, '<div class="tabla"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return { html, secciones };
}

async function leer(entrada: Entrada): Promise<Documento> {
  const archivo = new URL(`${entrada.slug || "index"}.md`, CONTENIDO);
  const { datos, cuerpo } = cabecera(await readFile(archivo, "utf8"));
  const titulo = datos["titulo"] ?? /^# (.+)$/m.exec(cuerpo)?.[1] ?? entrada.rotulo;
  const { html, secciones } = await convertir(cuerpo);

  // Para la búsqueda: el texto de cada sección, cortado por los h2 y h3.
  const textos: Documento["textos"] = [];
  const trozos = html.split(/(?=<h[23] id=")/);
  for (const trozo of trozos) {
    const id = /^<h[23] id="([^"]+)"/.exec(trozo)?.[1] ?? "";
    const tituloSeccion = id ? (secciones.find((s) => s.id === id)?.titulo ?? "") : titulo;
    textos.push({ id, titulo: tituloSeccion, texto: textoPlano(
        trozo
          .replace(/<div class="codigo">[\s\S]*?<\/pre><\/div>/g, " ")
          .replace(/<a class="ancla"[^>]*>#<\/a>/g, "")
          .replace(/^<h[23][\s\S]*?<\/h[23]>/, ""),
      ),
    });
  }

  return { entrada, titulo, descripcion: datos["descripcion"] ?? "", html, secciones, textos };
}

// ---------------------------------------------------------------------------
// El marco

function Barra() {
  return view`
    <nav class="barra">
      <a class="marca" href="/"><span class="punto"></span>ascua</a>
      <button class="abrir-menu" type="button" aria-label="Abrir el índice" aria-controls="lateral" aria-expanded="false">índice</button>
      <div class="enlaces">
        <a href="/docs/" class="actual">docs</a>
        <a href="/docs/api-runtime/">api</a>
        <a href="/playground/">playground</a>
        <button class="buscar" type="button" aria-label="Buscar en la documentación">buscar <kbd>/</kbd></button>
      </div>
      <span class="version">${VERSION}</span>
    </nav>`;
}

function Lateral(props: { actual: string }) {
  const lateral = view`
    <aside class="lateral" id="lateral">
      <For each=${() => INDICE}
           key=${(grupo: (typeof INDICE)[number]) => grupo.titulo}
           render=${(grupo: (typeof INDICE)[number]) => view`
             <div class="grupo">
               <p class="titulo-grupo">${grupo.titulo}</p>
               <ul>
                 <For each=${() => grupo.entradas}
                      key=${(e: Entrada) => e.slug}
                      render=${(e: Entrada) => view`
                        <li><a href=${ruta(e.slug)} aria-current=${e.slug === props.actual ? "page" : false}>${e.rotulo}</a></li>`}/>
               </ul>
             </div>`}/>
    </aside>`;
  return lateral;
}

function EnEstaPagina(props: { secciones: Seccion[] }) {
  return view`
    <aside class="en-esta-pagina">
      <p class="titulo-grupo">En esta página</p>
      <ul>
        <For each=${() => props.secciones}
             key=${(s: Seccion) => s.id}
             render=${(s: Seccion) => view`<li class=${`nivel-${s.nivel}`}><a href=${`#${s.id}`}>${s.titulo}</a></li>`}/>
      </ul>
    </aside>`;
}

function Vecinas(props: { anterior: Entrada | undefined; siguiente: Entrada | undefined }) {
  const nav = view`<nav class="vecinas" aria-label="Páginas vecinas"></nav>`;
  const enlace = (entrada: Entrada, clase: string, rotulo: string) => view`
    <a class=${clase} href=${ruta(entrada.slug)}>
      <span class="rotulo">${rotulo}</span>
      <span class="destino">${entrada.rotulo}</span>
    </a>`;
  nav.appendChild(props.anterior ? enlace(props.anterior, "anterior", "Anterior") : view`<span></span>`);
  if (props.siguiente) nav.appendChild(enlace(props.siguiente, "siguiente", "Siguiente"));
  return nav;
}

function Pagina(props: { doc: Documento; anterior: Entrada | undefined; siguiente: Entrada | undefined }) {
  const { doc } = props;
  const pagina = view`
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${doc.entrada.slug ? `${doc.titulo} · Ascua` : "Documentación · Ascua"}</title>
        <meta name="description" content=${doc.descripcion}>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='5' fill='%23e2703a'/></svg>">
        <link rel="stylesheet" href="/docs/docs.css">
      </head>
      <body>
        <div class="marco">
          <div class="contenido">
            <article class="prosa">
              <p class="kicker">${grupoDe(doc.entrada.slug)}</p>
              <h1>${doc.titulo}</h1>
              <p class="descripcion">${doc.descripcion}</p>
              <div class="cuerpo" prop:innerHTML=${doc.html}></div>
            </article>
          </div>
        </div>
        <footer>
          <p class="credito">Ascua ${VERSION} · MIT o Apache-2.0</p>
          <p>Santiago de Chile</p>
        </footer>
        <div class="busqueda" hidden>
          <div class="caja-busqueda" role="dialog" aria-label="Buscar en la documentación">
            <input type="search" placeholder="Buscar: signal, hydrate, prop:value…" aria-label="Buscar">
            <ol class="resultados"></ol>
            <p class="ayuda"><kbd>↑↓</kbd> para moverse · <kbd>↵</kbd> para abrir · <kbd>esc</kbd> para cerrar</p>
          </div>
        </div>
        <script src="/docs/docs.js" defer></script>
      </body>
    </html>`;

  // Los trozos van en su sitio a mano: una plantilla tiene una sola raíz, y
  // así cada uno sigue siendo un componente que se lee por separado.
  const cuerpo = pagina.querySelector("body")!;
  const marco = pagina.querySelector(".marco")!;
  const contenido = pagina.querySelector(".contenido")!;
  cuerpo.insertBefore(Barra(), marco);
  marco.insertBefore(Lateral({ actual: doc.entrada.slug }), contenido);
  contenido.appendChild(Vecinas(props));
  if (doc.secciones.length > 1) marco.appendChild(EnEstaPagina({ secciones: doc.secciones }));
  if (!doc.descripcion) pagina.querySelector(".descripcion")!.remove();
  return pagina;
}

function grupoDe(slug: string): string {
  return INDICE.find((g) => g.entradas.some((e) => e.slug === slug))?.titulo ?? "";
}

// ---------------------------------------------------------------------------
// Lo que se exporta

/** El HTML de una ruta bajo `/docs/`, o `null` si no hay página ahí. */
export async function renderizar(camino: string): Promise<string | null> {
  const slug = camino.replace(/^\/docs\/?/, "").replace(/\/+$/, "");
  const indice = ORDEN.findIndex((e) => e.slug === slug);
  if (indice < 0) return null;

  const doc = await leer(ORDEN[indice]!);
  const html = renderToString(() =>
    Pagina({ doc, anterior: ORDEN[indice - 1], siguiente: ORDEN[indice + 1] }),
  );
  return `<!doctype html>\n${html}`;
}

/** Todas las páginas: ruta → HTML. */
export async function todas(): Promise<Map<string, string>> {
  const salida = new Map<string, string>();
  for (const entrada of ORDEN) {
    const html = await renderizar(ruta(entrada.slug));
    if (html) salida.set(ruta(entrada.slug), html);
  }
  return salida;
}

/**
 * El índice de la búsqueda: una entrada por sección, con su texto. Pesa poco
 * y se pide la primera vez que alguien abre el buscador, no antes.
 */
export async function busqueda(): Promise<string> {
  const entradas = [];
  for (const entrada of ORDEN) {
    const doc = await leer(entrada);
    for (const { id, titulo, texto } of doc.textos) {
      entradas.push({
        p: doc.titulo,
        s: id ? titulo : "",
        u: `${ruta(entrada.slug)}${id ? `#${id}` : ""}`,
        t: texto.slice(0, 600),
      });
    }
  }
  return JSON.stringify(entradas);
}
