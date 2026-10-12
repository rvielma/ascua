import ascua from "vite-plugin-ascua";

// `mode: "server"`: pages render on each request, and routes can receive
// forms. `npm run build` leaves dist/server/index.mjs (Node, Bun, Deno) and
// dist/server/worker.mjs (Cloudflare Workers, workerd).
export default {
  plugins: [ascua({ site: { mode: "server" } })],
};
