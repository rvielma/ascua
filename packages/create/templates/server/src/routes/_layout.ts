import type { LayoutProps } from "vite-plugin-ascua/site";

/** Wraps every page. Each folder can have its own `_layout.ts`. */
export default function Layout(props: LayoutProps) {
  const frame = view`
    <div>
      <header>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
        </nav>
      </header>
      <main></main>
    </div>`;
  props.children(frame.querySelector("main")!);
  return frame;
}
