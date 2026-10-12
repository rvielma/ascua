/**
 * El cliente, con un `navigator.credentials` de mentira: lo que importa es la
 * conversión de JSON a bytes y de vuelta, y que los fallos del navegador
 * lleguen como `PasskeyError` con su código.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decode, encode } from "../base64url.js";
import { PasskeyError, authenticate, conditionalSupported, register, supported } from "../index.js";

const bytes = (...n) => Uint8Array.from(n);
const buffer = (...n) => bytes(...n).buffer;

let credentials;

function instalar({ nativo = false, condicional = true } = {}) {
  class PublicKeyCredential {}
  PublicKeyCredential.isConditionalMediationAvailable = async () => condicional;
  if (nativo) {
    PublicKeyCredential.parseCreationOptionsFromJSON = vi.fn((json) => ({ nativo: true, json }));
    PublicKeyCredential.parseRequestOptionsFromJSON = vi.fn((json) => ({ nativo: true, json }));
  }
  window.PublicKeyCredential = PublicKeyCredential;
  globalThis.PublicKeyCredential = PublicKeyCredential;
  credentials = { create: vi.fn(), get: vi.fn() };
  Object.defineProperty(navigator, "credentials", { value: credentials, configurable: true });
}

beforeEach(() => {
  document.documentElement.lang = "es";
});

afterEach(() => {
  delete window.PublicKeyCredential;
  delete globalThis.PublicKeyCredential;
  Object.defineProperty(navigator, "credentials", { value: undefined, configurable: true });
});

const CREACION = {
  challenge: encode(bytes(1, 2, 3)),
  rp: { id: "asiste.run", name: "asiste" },
  user: { id: encode(bytes(9, 9)), name: "ana@asiste.run", displayName: "Ana" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  timeout: 60_000,
  excludeCredentials: [{ type: "public-key", id: encode(bytes(7)) }],
};

const PETICION = {
  challenge: encode(bytes(4, 5, 6)),
  rpId: "asiste.run",
  allowCredentials: [{ type: "public-key", id: encode(bytes(8)), transports: ["internal"] }],
};

describe("soporte", () => {
  it("sin PublicKeyCredential no hay passkeys, y register lo dice", async () => {
    expect(supported()).toBe(false);
    expect(await conditionalSupported()).toBe(false);
    const error = await register(CREACION).catch((e) => e);
    expect(error).toBeInstanceOf(PasskeyError);
    expect(error.code).toBe("unsupported");
  });

  it("con PublicKeyCredential, y el autocompletado si el navegador lo admite", async () => {
    instalar();
    expect(supported()).toBe(true);
    expect(await conditionalSupported()).toBe(true);
    instalar({ condicional: false });
    expect(await conditionalSupported()).toBe(false);
  });
});

describe("register", () => {
  it("sin parseCreationOptionsFromJSON ni toJSON, convierte a mano en los dos sentidos", async () => {
    instalar();
    credentials.create.mockResolvedValue({
      id: encode(bytes(1, 1)),
      rawId: buffer(1, 1),
      type: "public-key",
      authenticatorAttachment: "platform",
      getClientExtensionResults: () => ({ credProps: { rk: true } }),
      response: {
        clientDataJSON: buffer(10, 11),
        attestationObject: buffer(12, 13),
        getTransports: () => ["internal", "hybrid"],
        getAuthenticatorData: () => buffer(14),
        getPublicKey: () => buffer(15),
        getPublicKeyAlgorithm: () => -7,
      },
    });

    const r = await register({ publicKey: CREACION });

    const { publicKey } = credentials.create.mock.calls[0][0];
    expect([...publicKey.challenge]).toEqual([1, 2, 3]);
    expect([...publicKey.user.id]).toEqual([9, 9]);
    expect([...publicKey.excludeCredentials[0].id]).toEqual([7]);
    expect(publicKey.rp).toEqual(CREACION.rp);

    expect(r).toEqual({
      id: encode(bytes(1, 1)),
      rawId: encode(bytes(1, 1)),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: { credProps: { rk: true } },
      response: {
        clientDataJSON: encode(bytes(10, 11)),
        attestationObject: encode(bytes(12, 13)),
        transports: ["internal", "hybrid"],
        authenticatorData: encode(bytes(14)),
        publicKey: encode(bytes(15)),
        publicKeyAlgorithm: -7,
      },
    });
  });

  it("con las funciones del navegador, las usa", async () => {
    instalar({ nativo: true });
    const json = { id: "x", nativo: true };
    credentials.create.mockResolvedValue({ toJSON: () => json });
    const controlador = new AbortController();

    expect(await register(CREACION, { signal: controlador.signal })).toBe(json);
    expect(PublicKeyCredential.parseCreationOptionsFromJSON).toHaveBeenCalledWith(CREACION);
    expect(credentials.create.mock.calls[0][0]).toEqual({
      publicKey: { nativo: true, json: CREACION },
      signal: controlador.signal,
    });
  });
});

describe("authenticate", () => {
  it("convierte a mano y devuelve el JSON que verifica el servidor", async () => {
    instalar();
    credentials.get.mockResolvedValue({
      id: encode(bytes(8)),
      rawId: buffer(8),
      type: "public-key",
      getClientExtensionResults: () => ({}),
      response: {
        clientDataJSON: buffer(1),
        authenticatorData: buffer(2),
        signature: buffer(3),
        userHandle: buffer(4),
      },
    });

    const r = await authenticate(PETICION);

    const { publicKey, mediation } = credentials.get.mock.calls[0][0];
    expect(mediation).toBeUndefined();
    expect([...publicKey.challenge]).toEqual([4, 5, 6]);
    expect([...publicKey.allowCredentials[0].id]).toEqual([8]);
    expect(publicKey.allowCredentials[0].transports).toEqual(["internal"]);
    expect(r.response).toEqual({
      clientDataJSON: encode(bytes(1)),
      authenticatorData: encode(bytes(2)),
      signature: encode(bytes(3)),
      userHandle: encode(bytes(4)),
    });
    expect(r.rawId).toBe(encode(bytes(8)));
  });

  it("conditional pide el autocompletado; sin userHandle no lo inventa", async () => {
    instalar();
    credentials.get.mockResolvedValue({
      id: "AQ",
      rawId: buffer(1),
      type: "public-key",
      response: { clientDataJSON: buffer(1), authenticatorData: buffer(2), signature: buffer(3), userHandle: null },
    });
    const r = await authenticate({ publicKey: { challenge: "AQID" } }, { conditional: true });
    expect(credentials.get.mock.calls[0][0].mediation).toBe("conditional");
    expect(r.response.userHandle).toBeUndefined();
    expect(r.clientExtensionResults).toEqual({});
  });
});

describe("errores", () => {
  const casos = [
    ["NotAllowedError", "cancelled"],
    ["AbortError", "cancelled"],
    ["InvalidStateError", "exists"],
    ["SecurityError", "security"],
    ["NotSupportedError", "unsupported"],
    ["TypeError", "unknown"],
  ];

  for (const [nombre, code] of casos) {
    it(`${nombre} → ${code}`, async () => {
      instalar();
      const original = new DOMException("del navegador", nombre);
      credentials.get.mockRejectedValue(original);
      const error = await authenticate(PETICION).catch((e) => e);
      expect(error).toBeInstanceOf(PasskeyError);
      expect(error.code).toBe(code);
      expect(error.cause).toBe(original);
    });
  }

  it("null del navegador es una cancelación", async () => {
    instalar();
    credentials.create.mockResolvedValue(null);
    expect((await register(CREACION).catch((e) => e)).code).toBe("cancelled");
  });

  it("NotAllowedError después del timeout es timeout", async () => {
    instalar();
    vi.useFakeTimers();
    try {
      credentials.get.mockImplementation(async () => {
        vi.advanceTimersByTime(2_000);
        throw new DOMException("tarde", "NotAllowedError");
      });
      expect((await authenticate({ ...PETICION, timeout: 1_000 }).catch((e) => e)).code).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("los mensajes salen en el idioma de la página", async () => {
    instalar();
    credentials.create.mockRejectedValue(new DOMException("x", "InvalidStateError"));
    expect((await register(CREACION).catch((e) => e)).message).toMatch(/ya está registrada/);
    document.documentElement.lang = "en";
    expect((await register(CREACION).catch((e) => e)).message).toMatch(/already registered/);
  });
});

describe("base64url", () => {
  it("ida y vuelta, sin relleno, y rechaza lo que no es base64url", () => {
    const todo = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...decode(encode(todo))]).toEqual([...todo]);
    expect(encode(bytes(0xfb, 0xff))).toBe("-_8");
    expect(() => decode("no válido!")).toThrow(TypeError);
  });
});
