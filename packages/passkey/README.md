# ascua-passkey

Passkeys sin dependencias: la ceremonia del navegador y la verificación en el
servidor con Web Crypto. El servidor corre igual en Node 20+, Deno, Bun y un
worker; el cliente sirve en cualquier página, con Ascua o sin él.

```sh
stil add ascua-passkey      # o npm install ascua-passkey
```

## En el navegador

```js
import { authenticate, PasskeyError, register, supported } from "ascua-passkey";

if (supported()) {
  const options = await fetch("/passkeys/login/options", { method: "POST" }).then((r) => r.json());
  try {
    const credential = await authenticate(options);
    await fetch("/passkeys/login", { method: "POST", body: JSON.stringify(credential) });
  } catch (error) {
    if (error instanceof PasskeyError && error.code === "cancelled") return; // cerró el diálogo
    throw error;
  }
}
```

Las opciones entran tal como las manda el servidor —el JSON de WebAuthn, con
o sin `{ publicKey }` alrededor— y lo que vuelve es el JSON que el servidor
verifica. La conversión de base64url a bytes, y de vuelta, la hace el
paquete: con `parseCreationOptionsFromJSON` y `toJSON()` donde el navegador
los tiene, y a mano donde no.

`register(options)` crea una passkey; `authenticate(options)` entra con una,
y con `{ conditional: true }` la ofrece en el autocompletado de un
`<input autocomplete="username webauthn">` (si `conditionalSupported()`).

Un fallo es un `PasskeyError` con `code`: `cancelled`, `exists` (ya está en
este dispositivo), `security`, `timeout`, `unsupported` o `unknown`. El
mensaje sale en el idioma de `<html lang>`, español o inglés.

## En el servidor

```js
import {
  authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration,
} from "ascua-passkey/server";

// Registrar, con el usuario ya identificado.
const { options, challenge } = registrationOptions({
  rp: { id: "ejemplo.cl", name: "Ejemplo" },
  user: { id: usuario.id, name: usuario.email },
  exclude: passkeysDelUsuario.map((p) => p.id),
});
// …guardar `challenge`, mandar `options`, recibir la respuesta…
const passkey = await verifyRegistration(respuesta, {
  challenge, origin: "https://www.ejemplo.cl", rpId: "ejemplo.cl",
});
// guardar passkey.id, passkey.publicKey y passkey.counter

// Entrar.
const login = authenticationOptions({ rpId: "ejemplo.cl" });
// …guardar login.challenge, mandar login.options, recibir la respuesta…
const guardada = buscarPasskey(respuesta.id);
const { counter } = await verifyAuthentication(respuesta, {
  challenge: login.challenge, origin: "https://www.ejemplo.cl", rpId: "ejemplo.cl", credential: guardada,
});
// actualizar guardada.counter = counter
```

Se comprueban el tipo de ceremonia, el reto, el origen, que la passkey sea de
este sitio, la presencia del usuario —y su verificación con
`requireUserVerification`—, la firma y el contador. Un rechazo es un
`VerificationError` con `code`; el mensaje es para el log, no para el
usuario. Algoritmos: ES256, RS256 y EdDSA.

**El reto es de un solo uso.** Guárdalo donde no se pueda reutilizar —una
cookie firmada que se borra al verificar, una fila con caducidad— y
descártalo después de la primera verificación, salga bien o mal.

**No se verifica la atestación del fabricante.** Las opciones piden
`attestation: "none"`, y se aceptan los formatos `none` y `packed`
autoatestado. Para entrar a un sitio basta: lo que importa es que quien entra
tiene la clave privada, no qué marca de llave la guarda.

Documentación: <https://ascua.gitweave.run/docs/passkeys/>

## Licencia

MIT o Apache-2.0, a elección.
