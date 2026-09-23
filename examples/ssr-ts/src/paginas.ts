/**
 * Las páginas. Se renderizan **solo en el servidor**: son HTML y nada más, y
 * su código no llega al navegador. Lo interactivo va en islas.
 */

import type { Children } from "@ascua/runtime";

import { LENGUAJES } from "./datos.js";
import { IslaBuscador, IslaContador } from "./islas/index.js";

export interface Pagina {
  titulo: string;
  estado: number;
  construir: () => HTMLElement;
}

function Marco(props: { ruta: string; children?: Children }) {
  const actual = (ruta: string) => (props.ruta === ruta ? "page" : false);
  const pagina = view`
    <div class="pagina">
      <header>
        <strong>Ascua · SSR</strong>
        <nav>
          <a href="/" aria-current=${actual("/")}>Inicio</a>
          <a href="/lenguajes" aria-current=${actual("/lenguajes")}>Lenguajes</a>
        </nav>
      </header>
      <main></main>
      <footer>Renderizado en el servidor con renderToString; las islas se hidratan con hydrate.</footer>
    </div>`;
  props.children?.(pagina.querySelector("main")!);
  return pagina;
}

function Inicio() {
  return view`
    <Marco ruta="/">
      <h1>HTML primero</h1>
      <p>Esta página llegó entera desde el servidor. El texto no necesita JavaScript; el contador sí, y es lo único que se hidrata.</p>
      <IslaContador inicial=${3}/>
      <p class="nota">Abre las herramientas de red: la página pide un solo script, con el runtime y el contador.</p>
    </Marco>`;
}

function Lenguajes() {
  return view`
    <Marco ruta="/lenguajes">
      <h1>Lenguajes</h1>
      <p>La lista viene completa en el HTML. El filtro adopta los mismos nodos que pintó el servidor.</p>
      <IslaBuscador lenguajes=${LENGUAJES}/>
    </Marco>`;
}

function NoEncontrada(props: { ruta: string }) {
  return view`
    <Marco ruta=${props.ruta}>
      <h1>No existe</h1>
      <p>No hay nada en <code>${props.ruta}</code>.</p>
    </Marco>`;
}

export function paginaPara(ruta: string): Pagina {
  switch (ruta) {
    case "/":
      return { titulo: "Inicio", estado: 200, construir: Inicio };
    case "/lenguajes":
      return { titulo: "Lenguajes", estado: 200, construir: Lenguajes };
    default:
      return { titulo: "No existe", estado: 404, construir: () => NoEncontrada({ ruta }) };
  }
}
