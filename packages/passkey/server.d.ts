/**
 * ascua-passkey/server: opciones y verificación de WebAuthn con Web Crypto.
 * Ver https://ascua.gitweave.run/docs/api-passkey/
 */

import type {
  AuthenticationResponseJSON,
  Base64URL,
  CreationOptionsJSON,
  RegistrationResponseJSON,
  RequestOptionsJSON,
  Transport,
} from "./index.js";

export type {
  AuthenticationResponseJSON,
  Base64URL,
  CreationOptionsJSON,
  RegistrationResponseJSON,
  RequestOptionsJSON,
  Transport,
};

/** Una passkey a excluir o a permitir: su id, o su id con sus transportes. */
export type CredentialRef = Base64URL | { id: Base64URL; transports?: Transport[] };

export type VerificationErrorCode =
  | "format"
  | "type"
  | "credential"
  | "challenge"
  | "origin"
  | "rp"
  | "flags"
  | "algorithm"
  | "signature"
  | "counter";

/** Un rechazo al verificar. `code` dice qué falló; el mensaje es para el log. */
export class VerificationError extends Error {
  readonly code: VerificationErrorCode;
  constructor(code: VerificationErrorCode, message: string);
}

/**
 * Opciones para crear una passkey. Guarda `challenge` —en una cookie firmada,
 * en la base de datos— para verificar la respuesta.
 */
export function registrationOptions(input: {
  rp: { id: string; name: string };
  /** `id`: opaco y estable, no el email. Un texto se codifica en UTF-8. */
  user: { id: string | Uint8Array; name: string; displayName?: string };
  /** Las passkeys que el usuario ya tiene: el navegador no deja duplicarlas. */
  exclude?: CredentialRef[];
  /** Milisegundos. Por defecto, 5 minutos. */
  timeout?: number;
}): { options: CreationOptionsJSON; challenge: Base64URL };

/** Opciones para entrar. Sin `allow`, el navegador ofrece las passkeys del sitio. */
export function authenticationOptions(input: {
  rpId: string;
  allow?: CredentialRef[];
  timeout?: number;
}): { options: RequestOptionsJSON; challenge: Base64URL };

export interface Expected {
  /** El reto que se emitió con las opciones. */
  challenge: Base64URL;
  /** El origen del sitio, o los permitidos: `"https://www.ejemplo.cl"`. */
  origin: string | string[];
  rpId: string;
  /** Exige que el autenticador haya verificado al usuario (PIN, huella). */
  requireUserVerification?: boolean;
}

/** Lo que hay que guardar de una passkey nueva. */
export interface VerifiedRegistration {
  id: Base64URL;
  /** La clave pública en COSE, para `verifyAuthentication`. */
  publicKey: Base64URL;
  /** -7 (ES256), -257 (RS256) o -8 (EdDSA). */
  algorithm: number;
  counter: number;
  transports: Transport[];
  /** Si está sincronizada (iCloud, Google, un gestor de contraseñas). */
  backedUp: boolean;
  deviceType: "singleDevice" | "multiDevice";
  userVerified: boolean;
}

export function verifyRegistration(response: RegistrationResponseJSON, expected: Expected): Promise<VerifiedRegistration>;

export interface VerifiedAuthentication {
  /** El contador nuevo: hay que guardarlo. */
  counter: number;
  backedUp: boolean;
  userVerified: boolean;
  /** El `user.id` con que se creó, en base64url, si el autenticador lo manda. */
  userHandle?: Base64URL;
}

export function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expected: Expected & { credential: { id: Base64URL; publicKey: Base64URL; counter?: number } },
): Promise<VerifiedAuthentication>;
