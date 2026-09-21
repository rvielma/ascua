import ascua from "@ascua/vite-plugin";

export default {
  plugins: [ascua({ bin: "../../target/debug/ascuac" })],
  resolve: {
    alias: { "@ascua/runtime": new URL("../../packages/runtime/src/index.ts", import.meta.url).pathname },
  },
  build: { minify: "terser", target: "es2022" },
};
