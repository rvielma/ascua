export default {
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "ascua": new URL("../runtime/src/index.ts", import.meta.url).pathname,
    },
  },
};
