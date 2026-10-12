/**
 * ascua-passkey: passkeys en el navegador. Ver https://ascua.gitweave.run/docs/passkeys/
 */

/** base64url sin relleno, como en los JSON de WebAuthn. */
export type Base64URL = string;

export type Transport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

export interface CredentialDescriptorJSON {
  type: "public-key";
  id: Base64URL;
  transports?: Transport[];
}

/** Las opciones para crear una passkey, tal como las manda el servidor. */
export interface CreationOptionsJSON {
  challenge: Base64URL;
  rp: { id?: string; name: string };
  user: { id: Base64URL; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  attestation?: "none" | "indirect" | "direct" | "enterprise";
  authenticatorSelection?: {
    authenticatorAttachment?: "platform" | "cross-platform";
    residentKey?: "discouraged" | "preferred" | "required";
    requireResidentKey?: boolean;
    userVerification?: "discouraged" | "preferred" | "required";
  };
  excludeCredentials?: CredentialDescriptorJSON[];
  extensions?: Record<string, unknown>;
  hints?: string[];
}

/** Las opciones para entrar, tal como las manda el servidor. */
export interface RequestOptionsJSON {
  challenge: Base64URL;
  rpId?: string;
  timeout?: number;
  userVerification?: "discouraged" | "preferred" | "required";
  allowCredentials?: CredentialDescriptorJSON[];
  extensions?: Record<string, unknown>;
  hints?: string[];
}

/** Lo que devuelve `register()`: se manda tal cual al servidor. */
export interface RegistrationResponseJSON {
  id: Base64URL;
  rawId: Base64URL;
  type: "public-key";
  authenticatorAttachment?: "platform" | "cross-platform";
  clientExtensionResults: Record<string, unknown>;
  response: {
    clientDataJSON: Base64URL;
    attestationObject: Base64URL;
    transports?: Transport[];
    authenticatorData?: Base64URL;
    publicKey?: Base64URL;
    publicKeyAlgorithm?: number;
  };
}

/** Lo que devuelve `authenticate()`: se manda tal cual al servidor. */
export interface AuthenticationResponseJSON {
  id: Base64URL;
  rawId: Base64URL;
  type: "public-key";
  authenticatorAttachment?: "platform" | "cross-platform";
  clientExtensionResults: Record<string, unknown>;
  response: {
    clientDataJSON: Base64URL;
    authenticatorData: Base64URL;
    signature: Base64URL;
    userHandle?: Base64URL;
  };
}

export type PasskeyErrorCode = "cancelled" | "unsupported" | "exists" | "security" | "timeout" | "unknown";

/** Un fallo de la ceremonia. El mensaje sale en el idioma de `<html lang>`. */
export class PasskeyError extends Error {
  readonly code: PasskeyErrorCode;
  constructor(code: PasskeyErrorCode, cause?: unknown);
}

/** Si el navegador puede crear y usar passkeys. */
export function supported(): boolean;

/** Si admite el autocompletado de passkeys (`<input autocomplete="username webauthn">`). */
export function conditionalSupported(): Promise<boolean>;

/** Crea una passkey con las opciones del servidor. */
export function register(
  options: CreationOptionsJSON | { publicKey: CreationOptionsJSON },
  init?: { signal?: AbortSignal },
): Promise<RegistrationResponseJSON>;

/** Entra con una passkey. `conditional`: desde el autocompletado de un campo. */
export function authenticate(
  options: RequestOptionsJSON | { publicKey: RequestOptionsJSON },
  init?: { signal?: AbortSignal; conditional?: boolean },
): Promise<AuthenticationResponseJSON>;
