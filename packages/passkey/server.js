/**
 * ascua-passkey/server: las opciones y la verificación de WebAuthn, con Web
 * Crypto y sin dependencias. Corre en Node 20+, Deno, Bun y un worker.
 *
 * Lo que no hace: verificar la atestación del fabricante. Se piden passkeys
 * con `attestation: "none"` y se aceptan los formatos `none` y `packed`
 * autoatestado (sin `x5c`). Para un login basta: lo que se comprueba es que
 * quien entra tiene la clave privada, no qué marca de llave la guarda.
 */

import { decode, encode, toBytes } from "./base64url.js";

/** Un rechazo al verificar, con un `code` que dice qué falló. */
export class VerificationError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "VerificationError";
    this.code = code;
  }
}

const rechazo = (code, message) => new VerificationError(code, message);

/** ES256, EdDSA y RS256: lo que se ofrece, en orden de preferencia. */
const ALGORITMOS = [-8, -7, -257];

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

const textoUtf8 = new TextEncoder();
const leerUtf8 = new TextDecoder();

/** Un reto nuevo: 32 bytes al azar, en base64url. */
function reto() {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}

const descriptor = (credencial) =>
  typeof credencial === "string"
    ? { type: "public-key", id: credencial }
    : {
        type: "public-key",
        id: credencial.id,
        ...(credencial.transports?.length ? { transports: credencial.transports } : {}),
      };

/**
 * Las opciones para crear una passkey. `user.id` es un identificador opaco y
 * estable —no el email—; si es texto, se codifica en UTF-8.
 */
export function registrationOptions({ rp, user, exclude = [], timeout = 300_000 }) {
  const challenge = reto();
  const id = typeof user.id === "string" ? textoUtf8.encode(user.id) : toBytes(user.id);
  return {
    challenge,
    options: {
      challenge,
      rp: { id: rp.id, name: rp.name },
      user: { id: encode(id), name: user.name, displayName: user.displayName ?? user.name },
      pubKeyCredParams: ALGORITMOS.map((alg) => ({ type: "public-key", alg })),
      timeout,
      attestation: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
      excludeCredentials: exclude.map(descriptor),
    },
  };
}

/** Las opciones para entrar. Sin `allow`, el navegador ofrece las passkeys del sitio. */
export function authenticationOptions({ rpId, allow, timeout = 300_000 }) {
  const challenge = reto();
  return {
    challenge,
    options: {
      challenge,
      rpId,
      timeout,
      userVerification: "preferred",
      ...(allow ? { allowCredentials: allow.map(descriptor) } : {}),
    },
  };
}

/**
 * Verifica lo que devolvió `register()` en el navegador. Lo que devuelve es
 * lo que hay que guardar de la passkey.
 */
export async function verifyRegistration(response, expected) {
  comprobarForma(response);
  const datosCliente = await comprobarCliente(response.response.clientDataJSON, "webauthn.create", expected);

  let atestacion;
  try {
    [atestacion] = cbor(decode(response.response.attestationObject));
  } catch {
    throw rechazo("format", "attestationObject no es CBOR válido");
  }
  if (!(atestacion instanceof Map)) throw rechazo("format", "attestationObject no es un mapa");
  const fmt = atestacion.get("fmt");
  const declaracion = atestacion.get("attStmt");
  const datos = atestacion.get("authData");
  if (!(datos instanceof Uint8Array) || !(declaracion instanceof Map)) {
    throw rechazo("format", "attestationObject incompleto");
  }

  const autenticador = await comprobarAutenticador(datos, expected);
  if (!(autenticador.flags & FLAG_AT) || !autenticador.credencial) {
    throw rechazo("format", "authData sin credencial");
  }
  const { id, cose } = autenticador.credencial;
  if (encode(id) !== response.id) throw rechazo("credential", "la credencial no es la que dice la respuesta");

  const clave = await claveDeCose(cose);

  if (fmt === "none") {
    if (declaracion.size > 0) throw rechazo("format", "attStmt de «none» debe estar vacío");
  } else if (fmt === "packed") {
    if (declaracion.has("x5c")) {
      throw rechazo("format", "atestación «packed» con certificado: no se verifica la del fabricante");
    }
    if (declaracion.get("alg") !== clave.algorithm) throw rechazo("algorithm", "attStmt.alg no es el de la clave");
    const firma = declaracion.get("sig");
    if (!(firma instanceof Uint8Array)) throw rechazo("format", "attStmt sin firma");
    const firmado = concatenar(datos, datosCliente.hash);
    if (!(await verificarFirma(clave, firma, firmado))) throw rechazo("signature", "la autoatestación no verifica");
  } else {
    throw rechazo("format", `formato de atestación no admitido: ${String(fmt)}`);
  }

  return {
    id: response.id,
    publicKey: encode(cose),
    algorithm: clave.algorithm,
    counter: autenticador.contador,
    transports: Array.isArray(response.response.transports) ? response.response.transports : [],
    backedUp: (autenticador.flags & FLAG_BS) !== 0,
    deviceType: (autenticador.flags & FLAG_BE) !== 0 ? "multiDevice" : "singleDevice",
    userVerified: (autenticador.flags & FLAG_UV) !== 0,
  };
}

/**
 * Verifica lo que devolvió `authenticate()` contra la passkey guardada. El
 * `counter` que devuelve es el que hay que guardar.
 */
export async function verifyAuthentication(response, expected) {
  comprobarForma(response);
  const { credential } = expected;
  if (response.id !== credential.id) throw rechazo("credential", "la respuesta es de otra passkey");
  const r = response.response;
  if (typeof r.authenticatorData !== "string" || typeof r.signature !== "string") {
    throw rechazo("format", "faltan authenticatorData o signature");
  }

  const datosCliente = await comprobarCliente(r.clientDataJSON, "webauthn.get", expected);
  const datos = decode(r.authenticatorData);
  const autenticador = await comprobarAutenticador(datos, expected);

  const clave = await claveDeCose(decode(credential.publicKey));
  const firmado = concatenar(datos, datosCliente.hash);
  if (!(await verificarFirma(clave, decode(r.signature), firmado))) {
    throw rechazo("signature", "la firma no verifica");
  }

  // Un contador que no avanza delata un clon. Las passkeys sincronizadas
  // devuelven siempre 0: entonces no dice nada.
  const anterior = credential.counter ?? 0;
  if ((autenticador.contador > 0 || anterior > 0) && autenticador.contador <= anterior) {
    throw rechazo("counter", "el contador no avanzó: posible clon de la passkey");
  }

  return {
    counter: autenticador.contador,
    backedUp: (autenticador.flags & FLAG_BS) !== 0,
    userVerified: (autenticador.flags & FLAG_UV) !== 0,
    ...(typeof r.userHandle === "string" && r.userHandle ? { userHandle: r.userHandle } : {}),
  };
}

// ---------------------------------------------------------------------------
// Comprobaciones comunes
// ---------------------------------------------------------------------------

function comprobarForma(response) {
  if (!response || typeof response !== "object" || typeof response.response !== "object") {
    throw rechazo("format", "la respuesta no es una credencial de WebAuthn");
  }
  if (response.type !== "public-key") throw rechazo("type", "la credencial no es de tipo public-key");
  if (typeof response.id !== "string" || (response.rawId !== undefined && response.rawId !== response.id)) {
    throw rechazo("credential", "id y rawId no coinciden");
  }
}

async function comprobarCliente(clientDataJSON, tipo, expected) {
  if (typeof clientDataJSON !== "string") throw rechazo("format", "falta clientDataJSON");
  const bytes = decode(clientDataJSON);
  let cliente;
  try {
    cliente = JSON.parse(leerUtf8.decode(bytes));
  } catch {
    throw rechazo("format", "clientDataJSON no es JSON");
  }
  if (cliente.type !== tipo) throw rechazo("type", `clientData.type es «${cliente.type}», no «${tipo}»`);
  if (sinRelleno(cliente.challenge) !== sinRelleno(expected.challenge)) {
    throw rechazo("challenge", "el reto no es el que se emitió");
  }
  const origenes = Array.isArray(expected.origin) ? expected.origin : [expected.origin];
  if (!origenes.includes(cliente.origin)) throw rechazo("origin", `origen no permitido: ${cliente.origin}`);
  if (cliente.crossOrigin === true) throw rechazo("origin", "la ceremonia vino de un iframe de otro origen");
  return { hash: new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)) };
}

const sinRelleno = (texto) => String(texto ?? "").replace(/=+$/, "");

async function comprobarAutenticador(datos, expected) {
  if (datos.length < 37) throw rechazo("format", "authData demasiado corto");
  const rpIdHash = datos.subarray(0, 32);
  const esperado = new Uint8Array(await crypto.subtle.digest("SHA-256", textoUtf8.encode(expected.rpId)));
  if (!iguales(rpIdHash, esperado)) throw rechazo("rp", "la passkey es de otro sitio (rpIdHash)");

  const flags = datos[32];
  if (!(flags & FLAG_UP)) throw rechazo("flags", "el usuario no estuvo presente");
  if (expected.requireUserVerification && !(flags & FLAG_UV)) {
    throw rechazo("flags", "el autenticador no verificó al usuario");
  }
  const contador = new DataView(datos.buffer, datos.byteOffset + 33, 4).getUint32(0);

  let credencial = null;
  if (flags & FLAG_AT) {
    if (datos.length < 55) throw rechazo("format", "authData sin datos de credencial");
    const largo = new DataView(datos.buffer, datos.byteOffset + 53, 2).getUint16(0);
    const id = datos.subarray(55, 55 + largo);
    let fin;
    try {
      [, fin] = cbor(datos, 55 + largo);
    } catch {
      throw rechazo("format", "la clave pública no es CBOR válido");
    }
    credencial = { id, cose: datos.slice(55 + largo, fin) };
  }
  return { flags, contador, credencial };
}

// ---------------------------------------------------------------------------
// Claves COSE y firmas
// ---------------------------------------------------------------------------

/** Importa una clave COSE para verificar con Web Crypto. */
async function claveDeCose(bytes) {
  let cose;
  try {
    [cose] = cbor(bytes);
  } catch {
    throw rechazo("format", "la clave pública no es CBOR válido");
  }
  if (!(cose instanceof Map)) throw rechazo("format", "la clave pública no es un mapa COSE");
  const kty = cose.get(1);
  const alg = cose.get(3);

  try {
    if (kty === 2 && alg === -7) {
      if (cose.get(-1) !== 1) throw rechazo("algorithm", "solo P-256 para ES256");
      const crudo = concatenar(Uint8Array.of(4), cose.get(-2), cose.get(-3));
      const key = await crypto.subtle.importKey("raw", crudo, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return { key, algorithm: -7, verify: { name: "ECDSA", hash: "SHA-256" } };
    }
    if (kty === 3 && alg === -257) {
      const jwk = { kty: "RSA", n: encode(cose.get(-1)), e: encode(cose.get(-2)), alg: "RS256", ext: true };
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
        "verify",
      ]);
      return { key, algorithm: -257, verify: { name: "RSASSA-PKCS1-v1_5" } };
    }
    if (kty === 1 && alg === -8) {
      if (cose.get(-1) !== 6) throw rechazo("algorithm", "solo Ed25519 para EdDSA");
      const key = await crypto.subtle.importKey("raw", cose.get(-2), { name: "Ed25519" }, false, ["verify"]);
      return { key, algorithm: -8, verify: { name: "Ed25519" } };
    }
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    throw rechazo("algorithm", `no se pudo importar la clave (${String(alg)}): ${error?.message ?? error}`);
  }
  throw rechazo("algorithm", `algoritmo no admitido: kty ${String(kty)}, alg ${String(alg)}`);
}

async function verificarFirma(clave, firma, datos) {
  // WebAuthn firma ECDSA en DER; Web Crypto la quiere como r‖s.
  const cruda = clave.algorithm === -7 ? derACrudo(firma) : firma;
  if (!cruda) return false;
  try {
    return await crypto.subtle.verify(clave.verify, clave.key, cruda, datos);
  } catch {
    return false;
  }
}

/** `SEQUENCE { INTEGER r, INTEGER s }` → r‖s de 32 bytes cada uno. */
function derACrudo(der) {
  if (der.length < 8 || der[0] !== 0x30) return null;
  let i = 2;
  const enteros = [];
  for (let n = 0; n < 2; n++) {
    if (der[i] !== 0x02) return null;
    const largo = der[i + 1];
    let entero = der.subarray(i + 2, i + 2 + largo);
    i += 2 + largo;
    while (entero.length > 32 && entero[0] === 0) entero = entero.subarray(1);
    if (entero.length > 32) return null;
    const relleno = new Uint8Array(32);
    relleno.set(entero, 32 - entero.length);
    enteros.push(relleno);
  }
  return concatenar(enteros[0], enteros[1]);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function concatenar(...partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const salida = new Uint8Array(total);
  let i = 0;
  for (const parte of partes) {
    salida.set(parte, i);
    i += parte.length;
  }
  return salida;
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

/**
 * Lo justo de CBOR (RFC 8949) para WebAuthn: enteros, bytes, texto, arrays,
 * mapas y los simples. Devuelve el valor y dónde terminó.
 */
function cbor(bytes, inicio = 0) {
  let i = inicio;
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const largo = (info) => {
    if (info < 24) return info;
    if (info === 24) return bytes[i++];
    if (info === 25) return (i += 2), vista.getUint16(i - 2);
    if (info === 26) return (i += 4), vista.getUint32(i - 4);
    if (info === 27) {
      const valor = vista.getBigUint64(i);
      i += 8;
      if (valor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("entero CBOR demasiado grande");
      return Number(valor);
    }
    throw new RangeError("longitud CBOR indefinida o reservada");
  };

  const valor = (profundidad) => {
    if (profundidad > 16) throw new RangeError("CBOR demasiado anidado");
    if (i >= bytes.length) throw new RangeError("CBOR cortado");
    const cabecera = bytes[i++];
    const tipo = cabecera >> 5;
    const info = cabecera & 0x1f;
    switch (tipo) {
      case 0:
        return largo(info);
      case 1:
        return -1 - largo(info);
      case 2:
      case 3: {
        const n = largo(info);
        if (i + n > bytes.length) throw new RangeError("CBOR cortado");
        const trozo = bytes.slice(i, i + n);
        i += n;
        return tipo === 2 ? trozo : leerUtf8.decode(trozo);
      }
      case 4: {
        const n = largo(info);
        const lista = [];
        for (let k = 0; k < n; k++) lista.push(valor(profundidad + 1));
        return lista;
      }
      case 5: {
        const n = largo(info);
        const mapa = new Map();
        for (let k = 0; k < n; k++) {
          const clave = valor(profundidad + 1);
          mapa.set(clave, valor(profundidad + 1));
        }
        return mapa;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        if (info === 23) return undefined;
        if (info === 25) return (i += 2), vista.getFloat16 ? vista.getFloat16(i - 2) : Number.NaN;
        if (info === 26) return (i += 4), vista.getFloat32(i - 4);
        if (info === 27) return (i += 8), vista.getFloat64(i - 8);
        throw new RangeError("simple CBOR no admitido");
      default:
        throw new RangeError("etiquetas CBOR no admitidas");
    }
  };

  const resultado = valor(0);
  return [resultado, i];
}
