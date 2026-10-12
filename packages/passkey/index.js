/**
 * ascua-passkey: passkeys en el navegador.
 *
 * Lo que el servidor manda —las opciones de WebAuthn en JSON— entra tal cual,
 * y lo que vuelve es el JSON que el servidor verifica. En medio, la ceremonia
 * del navegador y la conversión de base64url a bytes que ella exige. Sin
 * dependencias y sin framework: sirve en cualquier página.
 */

import { decode, encode } from "./base64url.js";

/** Los mensajes, en el idioma de la página: `<html lang="en">` o español. */
const MENSAJES = {
  es: {
    cancelled: "Se canceló o no se completó la verificación con la passkey.",
    unsupported: "Este navegador no admite passkeys.",
    exists: "Esta passkey ya está registrada en este dispositivo.",
    security: "La passkey no es válida para este sitio.",
    timeout: "Se acabó el tiempo para usar la passkey.",
    unknown: "No se pudo usar la passkey.",
  },
  en: {
    cancelled: "The passkey prompt was cancelled or not completed.",
    unsupported: "This browser does not support passkeys.",
    exists: "This passkey is already registered on this device.",
    security: "The passkey is not valid for this site.",
    timeout: "The passkey prompt timed out.",
    unknown: "The passkey could not be used.",
  },
};

const enIngles = () => typeof document !== "undefined" && /^en\b/i.test(document.documentElement.lang);

/** Un fallo de la ceremonia, con un `code` para decidir qué decir. */
export class PasskeyError extends Error {
  /**
   * @param {"cancelled" | "unsupported" | "exists" | "security" | "timeout" | "unknown"} code
   * @param {unknown} [cause]
   */
  constructor(code, cause) {
    super((enIngles() ? MENSAJES.en : MENSAJES.es)[code], cause === undefined ? undefined : { cause });
    this.name = "PasskeyError";
    this.code = code;
  }
}

/** Si el navegador puede crear y usar passkeys. */
export function supported() {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Si admite el autocompletado de passkeys en un `<input autocomplete="username webauthn">`. */
export async function conditionalSupported() {
  if (!supported()) return false;
  try {
    return (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

/**
 * Crea una passkey con las opciones que dio el servidor y devuelve lo que
 * hay que mandarle para que la verifique.
 */
export async function register(options, init = {}) {
  if (!supported()) throw new PasskeyError("unsupported");
  const json = options && "publicKey" in options ? options.publicKey : options;
  const publicKey =
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function"
      ? PublicKeyCredential.parseCreationOptionsFromJSON(json)
      : creacionDesdeJSON(json);

  const credencial = await ceremonia(
    () => navigator.credentials.create({ publicKey, ...(init.signal ? { signal: init.signal } : {}) }),
    json.timeout,
  );
  return typeof credencial.toJSON === "function" ? credencial.toJSON() : registroAJSON(credencial);
}

/**
 * Entra con una passkey. Con `conditional`, espera a que el usuario la elija
 * en el autocompletado de un campo en vez de abrir el diálogo.
 */
export async function authenticate(options, init = {}) {
  if (!supported()) throw new PasskeyError("unsupported");
  const json = options && "publicKey" in options ? options.publicKey : options;
  const publicKey =
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function"
      ? PublicKeyCredential.parseRequestOptionsFromJSON(json)
      : peticionDesdeJSON(json);

  const credencial = await ceremonia(
    () =>
      navigator.credentials.get({
        publicKey,
        ...(init.signal ? { signal: init.signal } : {}),
        ...(init.conditional ? { mediation: "conditional" } : {}),
      }),
    json.timeout,
  );
  return typeof credencial.toJSON === "function" ? credencial.toJSON() : accesoAJSON(credencial);
}

/** Llama al navegador y traduce sus excepciones a `PasskeyError`. */
async function ceremonia(llamar, timeout) {
  const inicio = Date.now();
  let credencial;
  try {
    credencial = await llamar();
  } catch (error) {
    if (error instanceof PasskeyError) throw error;
    const nombre = error && typeof error === "object" && "name" in error ? error.name : "";
    switch (nombre) {
      case "NotAllowedError":
        // El navegador no distingue «canceló» de «se acabó el tiempo».
        throw new PasskeyError(timeout && Date.now() - inicio >= timeout ? "timeout" : "cancelled", error);
      case "AbortError":
        throw new PasskeyError("cancelled", error);
      case "InvalidStateError":
        throw new PasskeyError("exists", error);
      case "SecurityError":
        throw new PasskeyError("security", error);
      case "NotSupportedError":
        throw new PasskeyError("unsupported", error);
      default:
        throw new PasskeyError("unknown", error);
    }
  }
  if (!credencial) throw new PasskeyError("cancelled");
  return credencial;
}

// ---------------------------------------------------------------------------
// Sin `parse…FromJSON` ni `toJSON` (Safari < 17.4, Firefox < 119): a mano.
// ---------------------------------------------------------------------------

const conBytes = (descriptor) => ({ ...descriptor, id: decode(descriptor.id) });

function creacionDesdeJSON(json) {
  const { challenge, user, excludeCredentials, ...resto } = json;
  return {
    ...resto,
    challenge: decode(challenge),
    user: { ...user, id: decode(user.id) },
    ...(excludeCredentials ? { excludeCredentials: excludeCredentials.map(conBytes) } : {}),
  };
}

function peticionDesdeJSON(json) {
  const { challenge, allowCredentials, ...resto } = json;
  return {
    ...resto,
    challenge: decode(challenge),
    ...(allowCredentials ? { allowCredentials: allowCredentials.map(conBytes) } : {}),
  };
}

function comun(credencial) {
  return {
    id: credencial.id,
    rawId: encode(credencial.rawId),
    type: credencial.type,
    authenticatorAttachment: credencial.authenticatorAttachment ?? undefined,
    clientExtensionResults: credencial.getClientExtensionResults?.() ?? {},
  };
}

function registroAJSON(credencial) {
  const r = credencial.response;
  const clave = r.getPublicKey?.();
  const datos = r.getAuthenticatorData?.();
  return {
    ...comun(credencial),
    response: {
      clientDataJSON: encode(r.clientDataJSON),
      attestationObject: encode(r.attestationObject),
      transports: r.getTransports?.() ?? [],
      ...(datos ? { authenticatorData: encode(datos) } : {}),
      ...(clave ? { publicKey: encode(clave) } : {}),
      ...(typeof r.getPublicKeyAlgorithm === "function" ? { publicKeyAlgorithm: r.getPublicKeyAlgorithm() } : {}),
    },
  };
}

function accesoAJSON(credencial) {
  const r = credencial.response;
  return {
    ...comun(credencial),
    response: {
      clientDataJSON: encode(r.clientDataJSON),
      authenticatorData: encode(r.authenticatorData),
      signature: encode(r.signature),
      ...(r.userHandle ? { userHandle: encode(r.userHandle) } : {}),
    },
  };
}
