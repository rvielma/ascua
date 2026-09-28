import type { Children } from "ascua";

/** Envuelve todas las páginas. Es un componente con hijos como cualquier otro. */
export default function Marco(props: { path: string; children: Children }) {
  const actual = (prefijo: string) =>
    props.path === prefijo || (prefijo !== "/" && props.path.startsWith(prefijo)) ? "page" : false;
  const pagina = view`
    <div class="pagina">
      <header>
        <strong>Ascua · sitio</strong>
        <nav>
          <a href="/" aria-current=${actual("/")}>Inicio</a>
          <a href="/lenguajes" aria-current=${actual("/lenguajes")}>Lenguajes</a>
        </nav>
      </header>
      <main></main>
      <footer>HTML generado al construir; solo las islas llevan JavaScript.</footer>
      <style>
        header, main, footer { max-width: 44rem; margin: 0 auto; padding: 1rem; }
        header { display: flex; gap: 1rem; align-items: baseline; border-bottom: 1px solid var(--borde); }
        header strong { margin-right: auto; }
        nav a { color: var(--tenue); text-decoration: none; margin-left: 1rem; }
        nav a[aria-current="page"] { color: var(--acento); }
        footer { color: var(--tenue); font-size: .85rem; border-top: 1px solid var(--borde); }
      </style>
    </div>`;
  props.children(pagina.querySelector("main")!);
  return pagina;
}
