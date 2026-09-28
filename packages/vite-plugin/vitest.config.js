export default {
  test: {
    include: ["test/**/*.test.js"],
    // Los tests construyen un sitio de verdad con Vite: tardan más que uno
    // unitario.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
};
