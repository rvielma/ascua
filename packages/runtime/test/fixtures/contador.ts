// Lo que escribe el usuario: HTML dentro de TypeScript.
import { signal } from "ascua";

export function Contador(inicial = 0) {
  const count = signal(inicial);
  const etiqueta = "contador";

  return view`
    <div class="caja" data-rol=${etiqueta}>
      <button class="menos" onclick=${() => count.update((c) => c - 1)}>−1</button>
      <output class=${() => (count() > 2 ? "alto" : "bajo")}>${() => count()}</output>
      <button class="mas" onclick=${() => count.update((c) => c + 1)}>+1</button>
      <p class="fijo">Empezó en ${inicial}</p>
    </div>`;
}
