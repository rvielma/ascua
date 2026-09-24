// @vitest-environment node
/**
 * El CSS de los componentes que solo existen en el servidor.
 *
 * En Node, vitest carga los módulos como lo haría el servidor: el plugin
 * registra la hoja del marco y `collectStyles` la devuelve con la página.
 */

import { describe, expect, it } from "vitest";

import { render } from "../src/entrada-servidor.js";

describe("los estilos de las páginas", () => {
  it("llegan con la página, con su scope", () => {
    const { html, css } = render("/");
    const scope = /data-ascua-([0-9a-f]{8})/.exec(html)![1];
    expect(css).toContain(`header[data-ascua-${scope}]`);
    expect(css).toContain("max-width: 44rem");
  });

  it("solo los de lo que aparece: una página sin marco no los lleva", async () => {
    const { collectStyles, renderToString } = await import("ascua/servidor");
    const { element } = await import("ascua");
    expect(collectStyles(renderToString(() => element("p")))).toBe("");
  });
});
