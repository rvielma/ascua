import { resource, signal } from "ascua";

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
