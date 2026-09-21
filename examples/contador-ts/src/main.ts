// Una aplicación de Ascua entera. No se ve Rust por ninguna parte: está en el
// compilador, que traduce las plantillas a operaciones de DOM.
import { list, mount, signal } from "@ascua/runtime";

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
    </main>`;

  list(
    app.querySelector(".tareas")!,
    () => tareas(),
    (tarea) => tarea.id,
    (tarea) => view`<li data-id=${tarea.id}>${tarea.titulo}</li>`,
  );

  return app;
}

mount(document.getElementById("raiz")!, App);
