/** Atrapa todo lo que cuelga de /docs/. */
export function parametros() {
  return [{ ruta: "guia/inicio" }, { ruta: "api" }];
}

export default function Documento({ ruta }: { ruta: string }) {
  return view`<article><h1>docs: ${ruta}</h1></article>`;
}
