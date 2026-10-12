import ascua from "vite-plugin-ascua";

// `site`: each file in src/routes/ is a page. https://ascua.gitweave.run/docs/sitios/
export default {
  plugins: [ascua({ site: true })],
};
