import { signal } from "@ascua/runtime";

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
