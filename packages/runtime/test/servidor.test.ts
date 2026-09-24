// @vitest-environment node
/**
 * El renderizado en servidor, en un entorno sin DOM.
 *
 * Este archivo corre en Node a secas: si el runtime tocara `document` en
 * algún sitio, fallaría aquí y no en producción.
 */

import { describe, expect, it } from "vitest";

import {
  append,
  attribute,
  cssClass,
  dynamicText,
  element,
  list,
  on,
  property,
  show,
  staticAttribute,
  text,
} from "../src/dom.js";
import { signal } from "../src/reactivo.js";
import { collectStyles, island, registerStyle, renderToString } from "../src/servidor.js";

describe("renderToString", () => {
  it("no necesita un navegador", () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
    const html = renderToString(() => {
      const h1 = element("h1");
      append(h1, text("Ascua"));
      return h1;
    });
    expect(html).toBe("<h1>Ascua</h1>");
  });

  it("ejecuta los efectos una vez, con el estado del momento", () => {
    const nombre = signal("mundo");
    const html = renderToString(() => {
      const p = element("p");
      staticAttribute(p, "class", "saludo");
      attribute(p, "data-n", () => nombre().length);
      attribute(p, "hidden", () => false);
      cssClass(p, "activo", () => true);
      append(p, text("Hola, "), dynamicText(() => nombre()));
      on(p, "click", () => {});
      return p;
    });
    expect(html).toBe('<p class="saludo activo" data-n="5">Hola, mundo</p>');
  });

  it("escapa texto y atributos", () => {
    const html = renderToString(() => {
      const a = element("a");
      staticAttribute(a, "title", 'dice "hola" & <adiós>');
      append(a, text("<script>alert(1)</script> & más"));
      return a;
    });
    expect(html).toBe(
      '<a title="dice &quot;hola&quot; &amp; <adiós>">&lt;script&gt;alert(1)&lt;/script&gt; &amp; más</a>',
    );
  });

  it("los elementos vacíos no se cierran y las propiedades salen como atributos", () => {
    const html = renderToString(() => {
      const form = element("form");
      const campo = element("input");
      property(campo, "value", () => "escrito");
      const casilla = element("input");
      staticAttribute(casilla, "type", "checkbox");
      property(casilla, "checked", () => true);
      append(form, campo, element("br"), casilla);
      return form;
    });
    expect(html).toBe('<form><input value="escrito"><br><input type="checkbox" checked></form>');
  });

  it("fuera de una isla no hay marcadores ni separadores: no se hidrata", () => {
    const html = renderToString(() => {
      const div = element("div");
      append(div, text("a"), text("b"));
      show(
        div,
        () => true,
        () => text("c"),
      );
      return div;
    });
    expect(html).toBe("<div>abc</div>");
  });

  it("dentro de una isla, los textos vacíos no salen y los seguidos se separan", () => {
    const html = renderToString(() =>
      island("i", () => {
        const p = element("p");
        append(p, text("a"), dynamicText(() => ""), text("b"), element("br"), text("c"));
        return p;
      }),
    );
    // «a» y «b» quedan juntos en el HTML: sin el separador, el navegador los
    // leería como un solo texto y la hidratación perdería la cuenta.
    expect(html).toContain('<p data-ascua-h="0">a<!--/-->b<br data-ascua-h="1">c</p>');
  });

  it("show y list renderizan su estado, con su marcador detrás", () => {
    const html = renderToString(() =>
      island("i", () => {
        const ul = element("ul");
        list(
          ul,
          () => ["x", "y"],
          (s) => s,
          (s) => {
            const li = element("li");
            append(li, text(s));
            return li;
          },
        );
        const div = element("div");
        show(
          div,
          () => true,
          () => text("visible"),
        );
        append(div, ul);
        return div;
      }),
    );
    expect(html).toContain(
      '<div data-ascua-h="4">visible<!--5--><ul data-ascua-h="0"><li data-ascua-h="2">x</li><li data-ascua-h="3">y</li><!--1--></ul></div>',
    );
  });

  it("prop:innerHTML emite el HTML tal cual", () => {
    const html = renderToString(() => {
      const articulo = element("article");
      property(articulo, "innerHTML", () => "<h2>Título</h2><p>a &amp; b</p>");
      return articulo;
    });
    expect(html).toBe("<article><h2>Título</h2><p>a &amp; b</p></article>");
  });

  it("querySelector encuentra huecos en lo recién construido", () => {
    const html = renderToString(() => {
      const caja = element("section");
      const cuerpo = element("div");
      staticAttribute(cuerpo, "class", "cuerpo grande");
      append(caja, cuerpo);
      append(caja.querySelector(".cuerpo.grande")!, text("dentro"));
      return caja;
    });
    expect(html).toBe('<section><div class="cuerpo grande">dentro</div></section>');
  });

  it("un selector que no entiende lo dice", () => {
    expect(() =>
      renderToString(() => {
        const div = element("div");
        div.querySelector("div > p");
        return div;
      }),
    ).toThrow(/selectores simples/);
  });

  it("no deja efectos vivos", () => {
    const n = signal(1);
    let ejecuciones = 0;
    renderToString(() => {
      const p = element("p");
      append(
        p,
        dynamicText(() => {
          ejecuciones++;
          return n();
        }),
      );
      return p;
    });
    n.set(2);
    expect(ejecuciones).toBe(1);
  });
});

describe("island", () => {
  it("numera lo de dentro, y solo lo de dentro", () => {
    const html = renderToString(() => {
      const main = element("main");
      append(
        main,
        island(
          "contador",
          () => {
            const div = element("div");
            const b = element("b");
            append(b, text("0"));
            show(
              div,
              () => true,
              () => element("i"),
            );
            append(div, b);
            return div;
          },
          '{"inicial":0}',
        ),
      );
      return main;
    });
    expect(html).toBe(
      '<main><ascua-island data-ascua-island="contador" data-ascua-props="{&quot;inicial&quot;:0}">' +
        '<div data-ascua-h="0"><i data-ascua-h="3"></i><!--2--><b data-ascua-h="1">0</b></div>' +
        "</ascua-island></main>",
    );
  });

  it("cada isla empieza a contar de cero", () => {
    const html = renderToString(() => {
      const main = element("main");
      append(main, island("a", () => element("p")), island("b", () => element("p")));
      return main;
    });
    expect(html.match(/data-ascua-h="0"/g)).toHaveLength(2);
  });
});

describe("collectStyles", () => {
  registerStyle(".nota[data-ascua-aaaa1111] { color: gray; }");
  registerStyle(".caja[data-ascua-bbbb2222] { padding: 1rem; }\n.caja h2[data-ascua-bbbb2222] { margin: 0; }");
  registerStyle(".otra[data-ascua-cccc3333] { color: red; }");

  it("devuelve solo el CSS de lo que aparece en la página", () => {
    const html = renderToString(() => {
      const div = element("div");
      staticAttribute(div, "data-ascua-bbbb2222", "");
      const p = element("p");
      staticAttribute(p, "data-ascua-aaaa1111", "");
      append(div, p);
      return div;
    });
    const css = collectStyles(html);
    expect(css).toContain("color: gray");
    expect(css).toContain("padding: 1rem");
    expect(css).not.toContain("color: red");
  });

  it("no confunde los atributos de la hidratación con un scope", () => {
    const html = renderToString(() => island("x", () => element("p")));
    expect(html).toContain("data-ascua-h=");
    expect(collectStyles(html)).toBe("");
  });

  it("de una hoja con varias plantillas, solo las reglas de la que se usa", () => {
    registerStyle(
      ".pagina[data-ascua-dddd4444] { color: teal; }\n\n" +
        "@media (min-width: 40rem) { .pagina[data-ascua-dddd4444] { padding: 2rem; } }\n\n" +
        "@keyframes latido { from { opacity: .5; } }\n\n" +
        ".otra[data-ascua-eeee5555] { color: purple; content: \"}\"; }",
    );
    const css = collectStyles('<main data-ascua-dddd4444=""></main>');
    expect(css).toContain("color: teal");
    expect(css).toContain("padding: 2rem");
    expect(css).toContain("@keyframes latido");
    expect(css).not.toContain("purple");
  });

  it("registrar dos veces la misma hoja no la duplica", () => {
    registerStyle(".nota[data-ascua-aaaa1111] { color: gray; }");
    const css = collectStyles('<p data-ascua-aaaa1111=""></p>');
    expect(css.match(/color: gray/g)).toHaveLength(1);
  });
});

