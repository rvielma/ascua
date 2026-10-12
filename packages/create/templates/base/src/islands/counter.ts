import { defineIsland, p, signal } from "ascua";

function Counter(props: { start: number }) {
  const count = signal(props.start);

  return view`
    <div class="counter">
      <button onclick=${() => count.update((n) => n - 1)}>−</button>
      <output>${() => count()}</output>
      <button onclick=${() => count.update((n) => n + 1)}>+</button>
      <style>
        .counter { display: flex; gap: .5rem; align-items: center; }
        output { min-width: 3ch; text-align: center; }
      </style>
    </div>`;
}

/** The island: its name, the schema of its props, and the component. */
export const CounterIsland = defineIsland("counter", { start: p.number }, Counter);
