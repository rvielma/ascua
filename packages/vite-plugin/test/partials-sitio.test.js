/**
 * `site: { partials: true }`: el script que navega va en todas las páginas,
 * también en las que no tienen islas, en el build y en desarrollo.
 */

import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROYECTO = new URL("./fixtures/partials/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist");

describe("partials en el kit", () => {
  beforeAll(async () => {
    rmSync(DIST, { recursive: true, force: true });
    await build({ root: PROYECTO, logLevel: "silent" });
  });

  it("una página sin islas lleva igual el script, con su lista vacía", () => {
    const inicio = readFileSync(join(DIST, "index.html"), "utf8");
    expect(inicio).toMatch(/<script type="module" src="\/assets\/ascua-client-[^"]+\.js"><\/script>/);
    expect(inicio).toContain('<script type="application/json" id="ascua-islands">[]</script>');
    expect(inicio).toContain('data-partial="main"');
  });

  it("la de la isla lista su módulo, y el cliente trae la navegación", () => {
    const b = readFileSync(join(DIST, "b/index.html"), "utf8");
    expect(b).toMatch(/id="ascua-islands">\["\/src\/islands\/contador\.ts"\]/);
    const script = /src="(\/assets\/ascua-client-[^"]+\.js)"/.exec(b)[1];
    const cliente = readFileSync(join(DIST, script), "utf8");
    expect(cliente).toContain("data-partial");
    expect(cliente).toContain("popstate");
  });

  describe("en desarrollo", () => {
    let vite;
    let origen;
    beforeAll(async () => {
      vite = await createServer({ root: PROYECTO, logLevel: "silent", server: { port: 0 } });
      await vite.listen();
      origen = `http://localhost:${vite.httpServer.address().port}`;
    });
    afterAll(() => vite?.close());

    it("también pone el script en la página sin islas", async () => {
      const html = await (await fetch(`${origen}/`)).text();
      expect(html).toContain("virtual:ascua-site/client");
      expect(html).toContain('data-partial="main"');
    });
  });
});
