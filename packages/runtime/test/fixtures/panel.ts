// Un panel de verdad en miniatura: componente con props e hijos, una región
// que se sustituye, una lista con clave y un formulario.
import { memo, signal, type Children } from "ascua";

interface Tarea {
  id: number;
  titulo: string;
  hecha: ReturnType<typeof signal<boolean>>;
}

function Tarjeta(props: { titulo: string; children?: Children }) {
  const caja = view`
    <section class="tarjeta">
      <h2>${props.titulo}</h2>
      <div class="cuerpo"></div>
    </section>`;
  props.children?.(caja.querySelector(".cuerpo")!);
  return caja;
}

export function Panel() {
  const entrado = signal(false);
  /** El campo al que hay que devolver el foco: se guarda con `ref`. */
  let campoUsuario: HTMLInputElement | null = null;
  const usuario = signal("");
  const filtro = signal("");
  let siguiente = 3;

  const tareas = signal<Tarea[]>([
    { id: 1, titulo: "Medir el bundle", hecha: signal(false) },
    { id: 2, titulo: "Dormir", hecha: signal(true) },
  ]);

  const visibles = memo(() =>
    tareas().filter((tarea) => tarea.titulo.toLowerCase().includes(filtro().toLowerCase())),
  );
  const pendientes = memo(() => tareas().filter((tarea) => !tarea.hecha()).length);

  return view`
    <div class="app">
      <Show when=${() => entrado()}>
        <Tarjeta titulo="Tareas">
          <p class="hola">Hola ${() => usuario()}</p>
          <p class="cuenta">${() => pendientes()} pendientes</p>
          <input class="filtro" prop:value=${() => filtro()}
                 oninput=${(e: Event) => filtro.set((e.target as HTMLInputElement).value)}>
          <ul class="tareas">
            <For each=${() => visibles()} key=${(t: Tarea) => t.id} render=${(t: Tarea) => view`
              <li data-id=${t.id} class="tarea" class:hecha=${() => t.hecha()}>
                <span class="titulo">${t.titulo}</span>
                <button class="alternar" onclick=${() => t.hecha.set(!t.hecha())}>x</button>
              </li>`}/>
          </ul>
          <Show when=${() => visibles().length === 0}>
            <p class="vacio">Nada coincide</p>
          </Show>
          <button class="anadir" onclick=${() => {
            const id = siguiente++;
            tareas.update((lista) => [...lista, { id, titulo: `Tarea ${id}`, hecha: signal(false) }]);
          }}>añadir</button>
          <button class="salir" onclick=${() => {
            entrado.set(false);
            // El nodo que guardó `ref`: sigue siendo el mismo objeto.
            campoUsuario?.setAttribute("data-recordado", "sí");
          }}>salir</button>
        </Tarjeta>

        <Else>
          <form class="acceso" onsubmit=${(e: Event) => {
            e.preventDefault();
            if (usuario().trim() !== "") entrado.set(true);
          }}>
            <input class="usuario" prop:value=${() => usuario()}
                   ref=${(nodo: HTMLInputElement) => (campoUsuario = nodo)}
                   oninput=${(e: Event) => usuario.set((e.target as HTMLInputElement).value)}>
            <button class="entrar" type="submit" disabled=${() => usuario().trim() === ""}>entrar</button>
          </form>
        </Else>
      </Show>
    </div>`;
}
