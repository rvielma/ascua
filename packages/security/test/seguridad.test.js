import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  checkOrigin,
  contentSecurityPolicy,
  createCookies,
  hash,
  inlineScripts,
  parseCookies,
  securityHeaders,
  serializeCookie,
  sign,
  unsign,
} from "../index.js";

const SECRETO = "un-secreto-de-prueba-con-32-caracteres-o-mas";

const peticion = (cabeceras, url = "http://ejemplo.cl/") => new Request(url, { method: "POST", headers: cabeceras });

describe("CSP", () => {
  it("el hash es el de CSP: sha256 en base64", async () => {
    const esperado = createHash("sha256").update("alert(1)").digest("base64");
    expect(await hash("alert(1)")).toBe(`'sha256-${esperado}'`);
  });

  it("cuenta los scripts en línea que se ejecutan, no los de src ni los de datos", () => {
    const html = `
      <script type="module" src="/assets/x.js"></script>
      <script type="application/json" id="ascua-islands">["/a.ts"]</script>
      <script type="application/ld+json">{}</script>
      <script>uno()</script>
      <SCRIPT type="module">dos()</SCRIPT>`;
    expect(inlineScripts(html)).toEqual(["uno()", "dos()"]);
  });

  it("la política de partida, con los hashes de la página", async () => {
    const csp = await contentSecurityPolicy("<script>uno()</script>");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(`script-src 'self' ${await hash("uno()")}`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("una página sin scripts en línea no lleva hashes", async () => {
    const csp = await contentSecurityPolicy('<script type="module" src="/a.js"></script>');
    expect(csp).toMatch(/script-src 'self'(;|$)/);
  });

  it("directives suma a la de partida y null quita; wasm permite compilar WebAssembly", async () => {
    const csp = await contentSecurityPolicy("", {
      directives: { "img-src": ["https://cdn.ejemplo.cl"], "frame-ancestors": null, "worker-src": ["'self'"] },
      wasm: true,
    });
    expect(csp).toContain("img-src 'self' data: blob: https://cdn.ejemplo.cl");
    expect(csp).not.toContain("frame-ancestors");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  });

  it("no repite fuentes", async () => {
    const csp = await contentSecurityPolicy("", { directives: { "script-src": ["'self'"] } });
    expect(csp).toMatch(/script-src 'self'(;|$)/);
  });
});

describe("cabeceras", () => {
  it("las de siempre, la CSP y HSTS solo si se pide", () => {
    const cabeceras = securityHeaders({ csp: "default-src 'self'" });
    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
    expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(cabeceras["cross-origin-opener-policy"]).toBe("same-origin");
    expect(cabeceras["content-security-policy"]).toBe("default-src 'self'");
    expect(cabeceras["strict-transport-security"]).toBeUndefined();
    expect(securityHeaders({ hsts: true })["strict-transport-security"]).toBe("max-age=31536000");
  });

  it("report-only, y headers reemplaza o quita", () => {
    const cabeceras = securityHeaders({
      csp: "x",
      reportOnly: true,
      headers: { "Cross-Origin-Opener-Policy": null, "Permissions-Policy": "camera=()" },
    });
    expect(cabeceras["content-security-policy"]).toBeUndefined();
    expect(cabeceras["content-security-policy-report-only"]).toBe("x");
    expect(cabeceras["cross-origin-opener-policy"]).toBeUndefined();
    expect(cabeceras["permissions-policy"]).toBe("camera=()");
  });
});

describe("firmas", () => {
  it("lo firmado se recupera, y lo tocado no", async () => {
    const firmado = await sign("usuario:7", SECRETO);
    expect(firmado.startsWith("usuario:7.")).toBe(true);
    expect(await unsign(firmado, SECRETO)).toBe("usuario:7");
    expect(await unsign(firmado.replace("7", "8"), SECRETO)).toBeNull();
    expect(await unsign(firmado, `${SECRETO}-otro`)).toBeNull();
    expect(await unsign("sin-firma", SECRETO)).toBeNull();
    expect(await unsign("x.%%%", SECRETO)).toBeNull();
  });

  it("un secreto corto es un error, no una firma débil", async () => {
    await expect(sign("x", "corto")).rejects.toThrow(/32 caracteres/);
  });
});

describe("cookies", () => {
  it("parseCookies decodifica y la primera gana", () => {
    expect(parseCookies("a=1; b=hola%20mundo; a=2; c=\"x\"; roto")).toEqual({ a: "1", b: "hola mundo", c: "x" });
    expect(parseCookies(null)).toEqual({});
  });

  it("serializeCookie: seguras por defecto", () => {
    expect(serializeCookie("sesion", "a b")).toBe("sesion=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(serializeCookie("tema", "oscuro", { httpOnly: false, secure: false, sameSite: "strict", maxAge: 60 })).toBe(
      "tema=oscuro; Path=/; Max-Age=60; SameSite=Strict",
    );
    expect(() => serializeCookie("con espacio", "x")).toThrow(/nombre de cookie/);
  });

  it("createCookies lee lo que llegó y junta lo que hay que mandar", () => {
    const cookies = createCookies("tema=claro; otra=1", { secure: false });
    expect(cookies.get("tema")).toBe("claro");
    cookies.set("tema", "oscuro", { httpOnly: false });
    expect(cookies.get("tema")).toBe("oscuro");
    cookies.delete("otra");
    expect(cookies.get("otra")).toBeUndefined();
    expect(cookies.all()).toEqual({ tema: "claro", otra: "1" });
    const lineas = cookies.headers();
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toBe("tema=oscuro; Path=/; SameSite=Lax");
    expect(lineas[1]).toMatch(/^otra=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970/);
  });

  it("las firmadas: se leen si la firma es buena, también desestructuradas", async () => {
    const { setSigned, getSigned, headers } = createCookies("", { secret: SECRETO });
    await setSigned("sesion", "u7");
    expect(await getSigned("sesion")).toBe("u7");
    const linea = headers()[0];

    const valor = decodeURIComponent(/^sesion=([^;]*)/.exec(linea)[1]);
    const siguiente = createCookies(`sesion=${encodeURIComponent(valor)}`, { secret: () => SECRETO });
    expect(await siguiente.getSigned("sesion")).toBe("u7");

    const falsa = createCookies(`sesion=${encodeURIComponent(valor.replace("u7", "u1"))}`, { secret: SECRETO });
    expect(await falsa.getSigned("sesion")).toBeUndefined();
    expect(await falsa.getSigned("nada")).toBeUndefined();
  });

  it("sin secreto, las firmadas fallan con un mensaje claro", async () => {
    await expect(createCookies("").setSigned("x", "1")).rejects.toThrow(/necesitan un secreto/);
  });
});

describe("checkOrigin", () => {
  it("el mismo origen pasa; otro no", () => {
    expect(checkOrigin(peticion({ origin: "http://ejemplo.cl", host: "ejemplo.cl" }))).toBe(true);
    expect(checkOrigin(peticion({ origin: "https://malo.cl", host: "ejemplo.cl" }))).toBe(false);
    expect(checkOrigin(peticion({ origin: "null", host: "ejemplo.cl" }))).toBe(false);
  });

  it("detrás de un proxy vale X-Forwarded-Host", () => {
    const cabeceras = { origin: "https://app.ejemplo.cl", host: "127.0.0.1:3000", "x-forwarded-host": "app.ejemplo.cl" };
    expect(checkOrigin(peticion(cabeceras))).toBe(true);
  });

  it("un subdominio hermano no es el mismo origen, salvo que se declare", () => {
    const cabeceras = { origin: "https://otro.ejemplo.cl", host: "app.ejemplo.cl" };
    expect(checkOrigin(peticion(cabeceras))).toBe(false);
    expect(checkOrigin(peticion(cabeceras), { origins: ["https://otro.ejemplo.cl"] })).toBe(true);
  });

  it("sin Origin pasa —no hay navegador— salvo que Sec-Fetch-Site diga cross-site", () => {
    expect(checkOrigin(peticion({ host: "ejemplo.cl" }))).toBe(true);
    expect(checkOrigin(peticion({ host: "ejemplo.cl", "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
