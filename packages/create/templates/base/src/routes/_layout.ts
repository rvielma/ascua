import type { Children } from "ascua";

/** Wraps every page. Each folder can have its own `_layout.ts`. */
export default function Layout(props: { children: Children }) {
  const frame = view`
    <div>
      <header>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
      </header>
      <main></main>
    </div>`;
  props.children(frame.querySelector("main")!);
  return frame;
}
