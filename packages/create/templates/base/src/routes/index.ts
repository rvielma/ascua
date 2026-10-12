import { CounterIsland } from "../islands/counter.js";

export const title = "Home";

/**
 * A page: rendered to HTML when building (or on each request with a server).
 * Only the island ships JavaScript.
 */
export default function Home() {
  return view`
    <section>
      <h1>Hello from Ascua</h1>
      <p>This page is plain HTML. The counter below is an island: the only part that hydrates.</p>
      <CounterIsland start=${3}/>
    </section>`;
}
