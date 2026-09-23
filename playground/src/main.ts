// El playground de Ascua, escrito con Ascua.
//
// El compilador que traduce las plantillas es un módulo WebAssembly de 82 KB,
// y aquí corre en la pestaña: no hay servidor que compile nada.

import init, { compilar_json, version } from "@ascua/compilador/web";
import { effect, memo, mount, on, signal } from "@ascua/runtime";

const EJEMPLO = `import { signal } from "@ascua/runtime";

export function Contador() {
  const count = signal(0);

  return view\`
    <button class="contador" onclick=\${() => count.update((c) => c + 1)}>
      Clicks: \${() => count()}
      <style>
        .contador { border-radius: 8px; padding: .5rem 1rem; }
        .contador:hover { border-color: tomato; }
      </style>
    </button>\`;
}
`;

interface Resultado {
  code: string;
  css: string;
  ms: number;
  error: string | null;
}

const fuente = signal(EJEMPLO);
const resultado = signal<Resultado>({ code: "", css: "", ms: 0, error: null });
const pestaña = signal<"js" | "css">("js");
const listo = signal(false);

function compilar(codigo: string): Resultado {
  const empezó = performance.now();
  try {
    const salida = JSON.parse(compilar_json(codigo)) as { code: string; css: string };
    return { ...salida, ms: performance.now() - empezó, error: null };
  } catch (error) {
    return { code: "", css: "", ms: performance.now() - empezó, error: String(error) };
  }
}

function App() {
  const bytes = memo(() => new TextEncoder().encode(resultado().code).length);
  const hayCss = memo(() => resultado().css.length > 0);

  const app = view`
    <main class="app">
      <header class="cabecera">
        <a class="marca" href="/"><span class="punto"></span>Ascua</a>
        <p class="lema">
          El compilador es un <b>.wasm de 82 KB</b>. Está corriendo en tu pestaña:
          esta página no tiene servidor detrás.
        </p>
      </header>

      <div class="paneles">
        <section class="panel">
          <p class="titulo">tu componente <span class="pista">TypeScript con HTML dentro</span></p>
          <textarea class="entrada" spellcheck="false"></textarea>
        </section>

        <section class="panel">
          <p class="titulo">
            lo que genera
            <span class="pista">${() => (resultado().error ? "error" : `${bytes()} B · ${resultado().ms.toFixed(1)} ms`)}</span>
          </p>
          <div class="pestanas"></div>
          <pre class="salida">${() => {
            const actual = resultado();
            if (actual.error) return actual.error;
            return pestaña() === "js" ? actual.code : actual.css || "(esta plantilla no lleva <style>)";
          }}</pre>
        </section>
      </div>

      <footer class="pie">
        <p>
          Una closure es reactiva; cualquier otra expresión se evalúa una vez.
          El <code>&lt;style&gt;</code> se extrae al compilar y no deja nada en
          tiempo de ejecución.
        </p>
        <p class="version">compilador v${() => (listo() ? version() : "…")} · WebAssembly</p>
      </footer>

      <style>
        .app { max-width: 68rem; margin: 0 auto; padding-top: 2.5rem; }
        .cabecera { margin-bottom: 2rem; }
        .marca {
          display: inline-flex; align-items: center; gap: .5rem; font-weight: 600;
          color: inherit; text-decoration: none; margin-bottom: .75rem;
        }
        .punto {
          width: .55rem; height: .55rem; border-radius: 50%; background: var(--brasa);
          box-shadow: 0 0 12px 1px rgba(226, 112, 58, .55);
        }
        .lema { margin: 0; color: var(--tenue); max-width: 60ch; }
        .lema b { color: var(--texto); font-weight: 600; }
        .paneles { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .panel {
          border: 1px solid var(--borde); border-radius: 12px; overflow: hidden;
          background: #131109; display: flex; flex-direction: column; min-height: 26rem;
        }
        .titulo {
          margin: 0; padding: .75rem 1rem; font-size: .72rem; text-transform: uppercase;
          letter-spacing: .08em; opacity: .5; border-bottom: 1px solid var(--borde);
          display: flex; justify-content: space-between; gap: 1rem;
        }
        .pista { text-transform: none; letter-spacing: 0; font-family: var(--mono); }
        .entrada {
          flex: 1; width: 100%; border: 0; resize: none; padding: 1rem;
          background: transparent; color: var(--texto); outline: none;
        }
        .salida { flex: 1; margin: 0; padding: 1rem; overflow: auto; white-space: pre-wrap; }
        .pie { margin-top: 1.5rem; color: var(--tenue); font-size: .85rem; }
        .pie p { margin: 0 0 .35rem; max-width: 70ch; }
        .version { font-family: var(--mono); font-size: .75rem; opacity: .45; }
        @media (max-width: 52rem) {
          .paneles { grid-template-columns: 1fr; }
        }
      </style>
    </main>`;

  // El textarea se rellena una vez: atarlo a un signal movería el cursor en
  // cada pulsación.
  const entrada = app.querySelector(".entrada") as HTMLTextAreaElement;
  entrada.value = fuente();

  let temporizador: number | undefined;
  on(entrada, "input", () => {
    clearTimeout(temporizador);
    // Compilar en cada tecla sería gratis para un archivo así, pero con uno
    // grande no: se espera a que la mano pare.
    temporizador = setTimeout(() => fuente.set(entrada.value), 120) as unknown as number;
  });

  const pestanas = app.querySelector(".pestanas") as HTMLElement;
  for (const [clave, etiqueta] of [
    ["js", "JavaScript"],
    ["css", "CSS extraído"],
  ] as const) {
    const boton = view`
      <button class=${() => (pestaña() === clave ? "pestana activa" : "pestana")}>
        ${etiqueta}
        <style>
          .pestana {
            font: inherit; font-size: .78rem; padding: .5rem .9rem; border: 0;
            border-bottom: 2px solid transparent; background: transparent;
            color: inherit; opacity: .5; cursor: pointer;
          }
          .pestana:hover { opacity: 1; }
          .activa { opacity: 1; color: var(--brasa); border-bottom-color: var(--brasa); }
        </style>
      </button>`;
    on(boton, "click", () => pestaña.set(clave));
    pestanas.appendChild(boton);
  }

  return app;
}

// El compilador se carga antes de montar: así la primera pintura ya trae
// resultado, sin un parpadeo de "cargando".
await init();
listo.set(true);

effect(() => resultado.set(compilar(fuente())));

mount(document.getElementById("raiz")!, App);
