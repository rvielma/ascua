// @vitest-environment node
/**
 * La verificación, con autenticadores de mentira: claves de Web Crypto y el
 * authData, el clientDataJSON y el attestationObject armados byte a byte,
 * como los arma una llave de verdad.
 */

import { describe, expect, it } from "vitest";

import { decode, encode } from "../base64url.js";
import {
  VerificationError,
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "../server.js";

const RP_ID = "asiste.run";
const ORIGEN = "https://www.asiste.run";
const utf8 = new TextEncoder();

// --- CBOR, lo justo para armar lo que manda un autenticador -----------------

function cabecera(tipo, n) {
  if (n < 24) return [(tipo << 5) | n];
  if (n < 0x100) return [(tipo << 5) | 24, n];
  if (n < 0x10000) return [(tipo << 5) | 25, n >> 8, n & 0xff];
  return [(tipo << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function cbor(valor) {
  if (typeof valor === "number") return Uint8Array.from(valor >= 0 ? cabecera(0, valor) : cabecera(1, -1 - valor));
  if (typeof valor === "string") {
    const b = utf8.encode(valor);
    return unir(Uint8Array.from(cabecera(3, b.length)), b);
  }
  if (valor instanceof Uint8Array) return unir(Uint8Array.from(cabecera(2, valor.length)), valor);
  if (valor instanceof Map) {
    const partes = [Uint8Array.from(cabecera(5, valor.size))];
    for (const [k, v] of valor) partes.push(cbor(k), cbor(v));
    return unir(...partes);
  }
  throw new Error(`no sé codificar ${valor}`);
}

function unir(...partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

/** r‖s → DER, como firma ECDSA un autenticador. */
function crudoADer(crudo) {
  const entero = (b) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.subarray(i);
    if (v[0] & 0x80) v = unir(Uint8Array.of(0), v);
    return unir(Uint8Array.of(0x02, v.length), v);
  };
  const cuerpo = unir(entero(crudo.subarray(0, 32)), entero(crudo.subarray(32)));
  return unir(Uint8Array.of(0x30, cuerpo.length), cuerpo);
}

// --- Un autenticador ------------------------------------------------------

const ALGS = {
  ES256: {
    alg: -7,
    generar: () => crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]),
    async cose(publica) {
      const crudo = new Uint8Array(await crypto.subtle.exportKey("raw", publica));
      return new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, crudo.slice(1, 33)],
        [-3, crudo.slice(33, 65)],
      ]);
    },
    async firmar(privada, datos) {
      const crudo = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privada, datos));
      return crudoADer(crudo);
    },
  },
  RS256: {
    alg: -257,
    generar: () =>
      crypto.subtle.generateKey(
        { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
        true,
        ["sign", "verify"],
      ),
    async cose(publica) {
      const jwk = await crypto.subtle.exportKey("jwk", publica);
      return new Map([
        [1, 3],
        [3, -257],
        [-1, decode(jwk.n)],
        [-2, decode(jwk.e)],
      ]);
    },
    async firmar(privada, datos) {
      return new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privada, datos));
    },
  },
  Ed25519: {
    alg: -8,
    generar: () => crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]),
    async cose(publica) {
      const crudo = new Uint8Array(await crypto.subtle.exportKey("raw", publica));
      return new Map([
        [1, 1],
        [3, -8],
        [-1, 6],
        [-2, crudo],
      ]);
    },
    async firmar(privada, datos) {
      return new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, privada, datos));
    },
  },
};

async function autenticador(tipo = "ES256", { rpId = RP_ID, origin = ORIGEN } = {}) {
  const a = ALGS[tipo];
  const { privateKey, publicKey } = await a.generar();
  const coseMap = await a.cose(publicKey);
  const id = crypto.getRandomValues(new Uint8Array(16));
  let contador = 0;

  const authData = async ({ flags, conCredencial, cuenta }) => {
    const partes = [await sha256(utf8.encode(rpId)), Uint8Array.of(flags), new Uint8Array(4)];
    new DataView(partes[2].buffer).setUint32(0, cuenta);
    if (conCredencial) {
      partes.push(new Uint8Array(16), Uint8Array.of(id.length >> 8, id.length & 0xff), id, cbor(coseMap));
    }
    return unir(...partes);
  };

  const clientData = (tipoCeremonia, challenge, extra = {}) =>
    utf8.encode(JSON.stringify({ type: tipoCeremonia, challenge, origin, crossOrigin: false, ...extra }));

  return {
    id: encode(id),
    /** Lo que devolvería `register()` en el navegador. */
    async crear(challenge, { flags = 0x45, fmt = "none", cliente = {}, alterar } = {}) {
      const datos = await authData({ flags, conCredencial: true, cuenta: contador });
      const cd = clientData("webauthn.create", challenge, cliente);
      let attStmt = new Map();
      if (fmt === "packed") {
        const sig = await a.firmar(privateKey, unir(datos, await sha256(cd)));
        attStmt = new Map([
          ["alg", a.alg],
          ["sig", sig],
        ]);
      }
      const respuesta = {
        id: encode(id),
        rawId: encode(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: encode(cd),
          attestationObject: encode(
            cbor(
              new Map([
                ["fmt", fmt],
                ["attStmt", attStmt],
                ["authData", datos],
              ]),
            ),
          ),
          transports: ["internal", "hybrid"],
        },
      };
      alterar?.(respuesta);
      return respuesta;
    },
    /** Lo que devolvería `authenticate()`. `cuenta`: el contador que manda. */
    async firmar(challenge, { flags = 0x05, cuenta, cliente = {}, alterarFirma = false } = {}) {
      contador = cuenta ?? contador + 1;
      const datos = await authData({ flags, conCredencial: false, cuenta: contador });
      const cd = clientData("webauthn.get", challenge, cliente);
      const firma = await a.firmar(privateKey, unir(datos, await sha256(cd)));
      if (alterarFirma) firma[firma.length - 5] ^= 0xff;
      return {
        id: encode(id),
        rawId: encode(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: encode(cd),
          authenticatorData: encode(datos),
          signature: encode(firma),
          userHandle: encode(utf8.encode("u-1")),
        },
      };
    },
  };
}

const esperado = (challenge, extra = {}) => ({ challenge, origin: [ORIGEN, "https://asiste.run"], rpId: RP_ID, ...extra });

async function rechaza(promesa, code) {
  const error = await promesa.then(
    () => null,
    (e) => e,
  );
  expect(error, `debió rechazar con ${code}`).toBeInstanceOf(VerificationError);
  expect(error.code).toBe(code);
}

/** Una passkey registrada y lista para entrar. */
async function registrada(tipo = "ES256") {
  const a = await autenticador(tipo);
  const { challenge } = registrationOptions({ rp: { id: RP_ID, name: "asiste" }, user: { id: "u-1", name: "ana@asiste.run" } });
  const guardada = await verifyRegistration(await a.crear(challenge), esperado(challenge));
  return { a, guardada };
}

// --- Opciones ---------------------------------------------------------------

describe("opciones", () => {
  it("registrationOptions: reto nuevo, user.id opaco, passkey descubrible y exclusiones", () => {
    const a = registrationOptions({
      rp: { id: RP_ID, name: "asiste" },
      user: { id: "u-1", name: "ana@asiste.run" },
      exclude: ["AAAA", { id: "BBBB", transports: ["internal"] }],
    });
    const b = registrationOptions({ rp: { id: RP_ID, name: "asiste" }, user: { id: "u-1", name: "ana@asiste.run" } });

    expect(a.challenge).not.toBe(b.challenge);
    expect(decode(a.challenge)).toHaveLength(32);
    expect(a.options.challenge).toBe(a.challenge);
    expect(new TextDecoder().decode(decode(a.options.user.id))).toBe("u-1");
    expect(a.options.user.displayName).toBe("ana@asiste.run");
    expect(a.options.pubKeyCredParams.map((p) => p.alg)).toEqual([-8, -7, -257]);
    expect(a.options.attestation).toBe("none");
    expect(a.options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "preferred" });
    expect(a.options.excludeCredentials).toEqual([
      { type: "public-key", id: "AAAA" },
      { type: "public-key", id: "BBBB", transports: ["internal"] },
    ]);
  });

  it("authenticationOptions: sin allow, el navegador ofrece las del sitio", () => {
    const { options, challenge } = authenticationOptions({ rpId: RP_ID });
    expect(options).toEqual({ challenge, rpId: RP_ID, timeout: 300_000, userVerification: "preferred" });
    expect(authenticationOptions({ rpId: RP_ID, allow: ["AAAA"] }).options.allowCredentials).toEqual([
      { type: "public-key", id: "AAAA" },
    ]);
  });
});

// --- Registro ---------------------------------------------------------------

describe("verifyRegistration", () => {
  for (const tipo of ["ES256", "RS256", "Ed25519"]) {
    it(`acepta una passkey ${tipo} con atestación none y devuelve lo que hay que guardar`, async () => {
      const { a, guardada } = await registrada(tipo);
      expect(guardada).toMatchObject({
        id: a.id,
        algorithm: ALGS[tipo].alg,
        counter: 0,
        transports: ["internal", "hybrid"],
        backedUp: false,
        deviceType: "singleDevice",
        userVerified: true,
      });
      expect(typeof guardada.publicKey).toBe("string");
    });
  }

  it("acepta packed autoatestado y comprueba su firma", async () => {
    const a = await autenticador("ES256");
    await expect(verifyRegistration(await a.crear("reto"), esperado("reto"))).resolves.toBeTruthy();
    await expect(verifyRegistration(await a.crear("reto", { fmt: "packed" }), esperado("reto"))).resolves.toMatchObject({
      algorithm: -7,
    });
  });

  it("dice si la passkey está sincronizada", async () => {
    const a = await autenticador();
    // UP | UV | BE | BS | AT
    const r = await verifyRegistration(await a.crear("reto", { flags: 0x5d }), esperado("reto"));
    expect(r).toMatchObject({ backedUp: true, deviceType: "multiDevice" });
  });

  it("rechaza otro reto, otro origen, otro sitio y otro tipo de ceremonia", async () => {
    const a = await autenticador();
    await rechaza(verifyRegistration(await a.crear("otro"), esperado("reto")), "challenge");
    await rechaza(
      verifyRegistration(await a.crear("reto", { cliente: { origin: "https://evil.example" } }), esperado("reto")),
      "origin",
    );
    await rechaza(
      verifyRegistration(await a.crear("reto", { cliente: { crossOrigin: true } }), esperado("reto")),
      "origin",
    );
    await rechaza(
      verifyRegistration(await a.crear("reto", { cliente: { type: "webauthn.get" } }), esperado("reto")),
      "type",
    );
    const otroSitio = await autenticador("ES256", { rpId: "evil.example" });
    await rechaza(verifyRegistration(await otroSitio.crear("reto"), esperado("reto")), "rp");
  });

  it("exige presencia, y verificación del usuario si se pide", async () => {
    const a = await autenticador();
    // AT sin UP
    await rechaza(verifyRegistration(await a.crear("reto", { flags: 0x40 }), esperado("reto")), "flags");
    // UP | AT, sin UV
    const sinUV = await a.crear("reto", { flags: 0x41 });
    await expect(verifyRegistration(sinUV, esperado("reto"))).resolves.toMatchObject({ userVerified: false });
    await rechaza(verifyRegistration(sinUV, esperado("reto", { requireUserVerification: true })), "flags");
  });

  it("rechaza una autoatestación con firma mala, formatos que no verifica e ids cruzados", async () => {
    const a = await autenticador();
    const mala = await a.crear("reto", {
      fmt: "packed",
      alterar(r) {
        // Otra autoatestación: la de un reto distinto.
        r.response.clientDataJSON = encode(
          utf8.encode(JSON.stringify({ type: "webauthn.create", challenge: "reto", origin: ORIGEN, x: 1 })),
        );
      },
    });
    await rechaza(verifyRegistration(mala, esperado("reto")), "signature");

    const tpm = await a.crear("reto", { fmt: "tpm" });
    await rechaza(verifyRegistration(tpm, esperado("reto")), "format");

    const cruzada = await a.crear("reto", {
      alterar(r) {
        r.id = r.rawId = "AAAAAAAAAAAAAAAAAAAAAA";
      },
    });
    await rechaza(verifyRegistration(cruzada, esperado("reto")), "credential");

    await rechaza(
      verifyRegistration({ ...(await a.crear("reto")), type: "otra" }, esperado("reto")),
      "type",
    );
  });
});

// --- Entrar -------------------------------------------------------------------

describe("verifyAuthentication", () => {
  for (const tipo of ["ES256", "RS256", "Ed25519"]) {
    it(`acepta una firma ${tipo} y devuelve el contador nuevo`, async () => {
      const { a, guardada } = await registrada(tipo);
      const { challenge } = authenticationOptions({ rpId: RP_ID });
      const r = await verifyAuthentication(await a.firmar(challenge), esperado(challenge, { credential: guardada }));
      expect(r).toEqual({ counter: 1, backedUp: false, userVerified: true, userHandle: encode(utf8.encode("u-1")) });
    });
  }

  it("rechaza una firma alterada", async () => {
    for (const tipo of ["ES256", "RS256"]) {
      const { a, guardada } = await registrada(tipo);
      await rechaza(
        verifyAuthentication(await a.firmar("reto", { alterarFirma: true }), esperado("reto", { credential: guardada })),
        "signature",
      );
    }
  });

  it("rechaza otro reto, otro origen, otra passkey y otro tipo de ceremonia", async () => {
    const { a, guardada } = await registrada();
    const credencial = { credential: guardada };
    await rechaza(verifyAuthentication(await a.firmar("otro"), esperado("reto", credencial)), "challenge");
    await rechaza(
      verifyAuthentication(await a.firmar("reto", { cliente: { origin: "http://localhost:5180" } }), esperado("reto", credencial)),
      "origin",
    );
    await rechaza(
      verifyAuthentication(await a.firmar("reto", { cliente: { type: "webauthn.create" } }), esperado("reto", credencial)),
      "type",
    );
    const { guardada: otra } = await registrada();
    await rechaza(verifyAuthentication(await a.firmar("reto"), esperado("reto", { credential: otra })), "credential");
  });

  it("rechaza la passkey de otro sitio", async () => {
    const { guardada } = await registrada();
    const { challenge } = authenticationOptions({ rpId: "localhost" });
    const a = await autenticador();
    await rechaza(
      verifyAuthentication(await a.firmar(challenge), { challenge, origin: ORIGEN, rpId: "localhost", credential: { ...guardada, id: a.id } }),
      "rp",
    );
  });

  it("exige verificación del usuario si se pide", async () => {
    const { a, guardada } = await registrada();
    // Solo UP
    const r = await a.firmar("reto", { flags: 0x01 });
    await expect(verifyAuthentication(r, esperado("reto", { credential: guardada }))).resolves.toMatchObject({
      userVerified: false,
    });
    await rechaza(
      verifyAuthentication(await a.firmar("reto", { flags: 0x01 }), esperado("reto", { credential: guardada, requireUserVerification: true })),
      "flags",
    );
    await rechaza(
      verifyAuthentication(await a.firmar("reto", { flags: 0x04 }), esperado("reto", { credential: guardada })),
      "flags",
    );
  });

  it("un contador que no avanza delata un clon; siempre 0 es una passkey sincronizada", async () => {
    const { a, guardada } = await registrada();
    const con = (counter) => esperado("reto", { credential: { ...guardada, counter } });

    await expect(verifyAuthentication(await a.firmar("reto", { cuenta: 5 }), con(4))).resolves.toMatchObject({ counter: 5 });
    await rechaza(verifyAuthentication(await a.firmar("reto", { cuenta: 4 }), con(4)), "counter");
    await rechaza(verifyAuthentication(await a.firmar("reto", { cuenta: 3 }), con(4)), "counter");
    await expect(verifyAuthentication(await a.firmar("reto", { cuenta: 0 }), con(0))).resolves.toMatchObject({ counter: 0 });
  });

  it("rechaza respuestas mal formadas sin tirar el servidor", async () => {
    const { guardada } = await registrada();
    await rechaza(verifyAuthentication(null, esperado("reto", { credential: guardada })), "format");
    await rechaza(
      verifyAuthentication(
        { id: guardada.id, rawId: guardada.id, type: "public-key", response: { clientDataJSON: "e30" } },
        esperado("reto", { credential: guardada }),
      ),
      "format",
    );
    await rechaza(
      verifyAuthentication(
        {
          id: guardada.id,
          rawId: guardada.id,
          type: "public-key",
          response: { clientDataJSON: encode(utf8.encode("no es json")), authenticatorData: "AAAA", signature: "AAAA" },
        },
        esperado("reto", { credential: guardada }),
      ),
      "format",
    );
  });
});
