// Una aplicación de Ascua entera. No se ve Rust por ninguna parte: está en el
// compilador, que traduce las plantillas a operaciones de DOM.
import { list, mount, signal } from "ascua";

interface Tarea {
  id: number;
  titulo: string;
}

function App() {
  const count = signal(0);
  const tareas = signal<Tarea[]>([
    { id: 1, titulo: "Medir el bundle" },
    { id: 2, titulo: "Dormir" },
  ]);
  let siguiente = 3;

  const app = view`
    <main class="app">
      <h1>Ascua</h1>

      <section class="contador">
        <output class=${() => (count() % 2 === 0 ? "par" : "impar")}>${() => count()}</output>
        <button onclick=${() => count.update((c) => c - 1)}>−1</button>
        <button onclick=${() => count.update((c) => c + 1)}>+1</button>
      </section>

      <ul class="tareas"></ul>

      <button class="anadir" onclick=${() => {
        tareas.update((lista) => [...lista, { id: siguiente, titulo: `Tarea ${siguiente}` }]);
        siguiente += 1;
      }}>añadir</button>
      <button class="rotar" onclick=${() =>
        tareas.update((lista) => (lista.length ? [lista.at(-1)!, ...lista.slice(0, -1)] : lista))
      }>rotar</button>

      <style>
        .app { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 30rem; margin: 3rem auto; }
        h1 { font-size: 1.5rem; }
        .contador { display: flex; align-items: center; gap: .5rem; margin-bottom: 1.5rem; }
        output { font-size: 2rem; font-variant-numeric: tabular-nums; min-width: 2ch; }
        output.impar { color: #e2703a; }
        .tareas { list-style: none; padding: 0; display: grid; gap: .4rem; }
      </style>
    </main>`;

  list(
    app.querySelector(".tareas")!,
    () => tareas(),
    (tarea) => tarea.id,
    (tarea) => view`
      <li data-id=${tarea.id}>
        ${tarea.titulo}
        <style>
          li { border: 1px solid #0002; border-radius: 8px; padding: .5rem .75rem; }
        </style>
      </li>`,
  );

  return app;
}

mount(document.getElementById("raiz")!, App);
