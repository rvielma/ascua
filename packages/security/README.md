# ascua-security

La seguridad de la capa web que un servidor que pinta HTML tiene que hacer
bien, y que casi nunca hace por defecto. Sin dependencias y con Web Crypto:
corre igual en Node, Deno, Bun y un worker.

```sh
stil add ascua-security      # o npm install ascua-security
```

El kit de sitios de [`vite-plugin-ascua`](https://ascua.gitweave.run/docs/sitios/)
lo aplica solo en `mode: "server"`. Este paquete es para usarlo en cualquier
otro servidor.

## Content-Security-Policy con hashes

```js
import { contentSecurityPolicy, securityHeaders } from "ascua-security";

const csp = await contentSecurityPolicy(html);
for (const [nombre, valor] of Object.entries(securityHeaders({ csp, hsts: true }))) {
  respuesta.setHeader(nombre, valor);
}
```

`contentSecurityPolicy` parte de una política cerrada —todo de `'self'`, sin
`<object>`, sin `<base>` ajeno, sin formularios hacia otro sitio, sin
`<iframe>` ajeno— y añade el **hash de cada script en línea** del HTML que se
va a enviar. Lo que la página trae funciona sin `'unsafe-inline'`; lo que se
cuele, no corre. Los scripts de datos (`application/json`) no cuentan.

```js
await contentSecurityPolicy(html, {
  directives: { "img-src": ["https://cdn.ejemplo.cl"], "frame-ancestors": null },
  wasm: true, // 'wasm-unsafe-eval': sin él, el navegador no compila WebAssembly
});
```

`securityHeaders` añade `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Cross-Origin-Opener-Policy` y, con `hsts`, `Strict-Transport-Security`.
`reportOnly` manda la CSP como `-Report-Only`, que avisa sin bloquear.

## Cookies

```js
import { createCookies } from "ascua-security";

const cookies = createCookies(request.headers.get("cookie"), { secret: process.env.SECRETO });
cookies.get("tema");
await cookies.setSigned("sesion", idDeUsuario, { maxAge: 60 * 60 * 24 * 7 });
const id = await cookies.getSigned("sesion"); // undefined si alguien la tocó
for (const linea of cookies.headers()) respuesta.headers.append("set-cookie", linea);
```

Por defecto, `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/`. Las firmadas
llevan HMAC-SHA256: el valor viaja legible —firmar no es cifrar—, pero no se
puede cambiar sin el secreto, que tiene que tener 32 caracteres o más.
`sign`, `unsign`, `parseCookies` y `serializeCookie` están sueltos.

## CSRF

```js
import { checkOrigin } from "ascua-security";

if (request.method === "POST" && !checkOrigin(request)) return new Response("", { status: 403 });
```

Todo navegador manda `Origin` en un POST, y otro sitio no puede falsificarlo.
`checkOrigin` lo compara con el host propio —`X-Forwarded-Host` detrás de un
proxy—. Sin `Origin` no hay navegador que engañar, y pasa, salvo que
`Sec-Fetch-Site` diga `cross-site`. `{ origins: [...] }` añade otros orígenes
de confianza.

## Licencia

MIT OR Apache-2.0
