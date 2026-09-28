import { defineIsland, p, signal } from "ascua";

/** Un contador. Es un componente normal: no sabe si lo pintó el servidor. */
export function Contador(props: { inicial: number }) {
  const cuenta = signal(props.inicial);

  return view`
    <div class="contador">
      <button aria-label="restar" onclick=${() => cuenta.update((c) => c - 1)}>−</button>
      <output>${() => cuenta()}</output>
      <button aria-label="sumar" onclick=${() => cuenta.update((c) => c + 1)}>+</button>
    </div>`;
}

/**
 * La isla: el contador, con el esquema de sus props. Una isla por archivo:
 * cada página descarga solo los módulos de las islas que usa.
 */
export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);
