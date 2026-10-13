/**
 * base64url sin relleno, el formato de los JSON de WebAuthn. Lo comparten el
 * cliente y el servidor; `btoa`/`atob` existen en el navegador, Node 20+,
 * Deno, Bun y los workers.
 */

/** @param {ArrayBuffer | ArrayBufferView} datos */
export function encode(datos) {
  const bytes = toBytes(datos);
  let binario = "";
  // A trozos: `String.fromCharCode(...bytes)` revienta la pila con una clave RSA.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} texto */
export function decode(texto) {
  if (typeof texto !== "string" || !/^[A-Za-z0-9_-]*={0,2}$/.test(texto)) {
    throw new TypeError("invalid base64url");
  }
  const base64 = texto.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** @param {ArrayBuffer | ArrayBufferView} datos */
export function toBytes(datos) {
  if (datos instanceof Uint8Array) return datos;
  if (ArrayBuffer.isView(datos)) return new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
  return new Uint8Array(datos);
}
