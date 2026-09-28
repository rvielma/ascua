import { resource, signal, type Present } from "ascua";

interface Club {
  nombre: string;
}

function Menu() {
  return view`<nav>menú</nav>`;
}

function Aviso(props: { texto?: string }) {
  return view`<p>${props.texto ?? ""}</p>`;
}

function Pide(props: { texto: string }) {
  return view`<p>${props.texto}</p>`;
}

export function Novedades() {
  const club = signal<Club | undefined>(undefined);
  const nombre = signal("");
  const cuenta = signal(0);
  const datos = resource(async () => 1);

  return view`
    <main>
      <Menu/>
      <Aviso/>
      <Pide/>
      <Show when=${() => club()}>${(c) => view`<h2>${() => c().nombre}</h2>`}</Show>
      <input bind:value=${nombre}>
      <input bind:value=${cuenta}>
      <p>${() => datos() ?? 0}</p>
    </main>`;
}

// Lo que costó al adoptar la 0.3 en Letra Muerta.
function EnCurso(r: () => number) {
  return view`<p>${() => r()}</p>`;
}

export function Cargado<T>(props: { dato: () => T | undefined; hijo: (d: T) => Node }) {
  return view`
    <div>
      <Show when=${props.dato}>${(d: () => Present<T>) => props.hijo(d())}</Show>
    </div>`;
}

export function Adopcion() {
  const datos = resource(async () => 1);
  return view`
    <div>
      <Show when=${datos}>${(n) => view`<b>${() => n() + 1}</b>`}</Show>
      <Show when=${datos}>${EnCurso}</Show>
    </div>`;
}
