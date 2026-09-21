/**
 * La pantalla de acceso.
 *
 * Tiene todo lo que hace incómodo un formulario de verdad: validación
 * mientras se escribe, una espera durante la que no se puede volver a enviar,
 * y un error que aparece y desaparece.
 */

import { batch, memo, signal } from "@ascua/runtime";

import { Campo } from "./componentes.js";
import { iniciarSesion, type Sesion } from "./sesion.js";

export function Login(props: { onentrar: (sesion: Sesion) => void }) {
  const usuario = signal("");
  const clave = signal("");
  const error = signal("");
  const esperando = signal(false);

  const completo = memo(() => usuario().trim() !== "" && clave() !== "");
  const puedeEnviar = memo(() => completo() && !esperando());

  async function enviar(evento: Event) {
    evento.preventDefault();
    if (!puedeEnviar()) return;

    // Las dos escrituras en un lote: los efectos corren una vez, no dos.
    batch(() => {
      esperando.set(true);
      error.set("");
    });

    try {
      props.onentrar(await iniciarSesion(usuario(), clave()));
    } catch (fallo) {
      error.set(fallo instanceof Error ? fallo.message : "No se pudo entrar.");
      clave.set("");
    } finally {
      esperando.set(false);
    }
  }

  return view`
    <main class="acceso">
      <form onsubmit=${enviar}>
        <h1>Ascua</h1>
        <p class="ayuda">Entra con <code>ana</code> o <code>luis</code>, clave <code>ascua</code>.</p>

        <Campo
          etiqueta="Usuario"
          nombre="usuario"
          valor=${() => usuario()}
          oncambio=${(valor: string) => usuario.set(valor)}
          deshabilitado=${() => esperando()}/>

        <Campo
          etiqueta="Contraseña"
          nombre="clave"
          tipo="password"
          valor=${() => clave()}
          oncambio=${(valor: string) => clave.set(valor)}
          deshabilitado=${() => esperando()}/>

        <Show when=${() => error() !== ""}>
          <p class="error" role="alert">${() => error()}</p>
        </Show>

        <button type="submit" disabled=${() => !puedeEnviar()}>
          ${() => (esperando() ? "Comprobando…" : "Entrar")}
        </button>
      </form>

      <style>
        .acceso { min-height: 100dvh; display: grid; place-items: center; padding: 1.5rem; }
        form { display: grid; gap: .9rem; width: min(22rem, 100%);
               border: 1px solid var(--borde); border-radius: 12px;
               background: var(--panel); padding: 1.75rem; }
        h1 { margin: 0; font-size: 1.35rem; letter-spacing: -.01em; }
        .ayuda { margin: -.4rem 0 .2rem; font-size: .8rem; color: var(--tenue); }
        code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .error { margin: 0; font-size: .82rem; color: var(--error);
                 background: color-mix(in srgb, var(--error) 12%, transparent);
                 border-radius: 7px; padding: .5rem .6rem; }
        button { font: inherit; font-weight: 600; padding: .55rem 1rem; border: 0;
                 border-radius: 7px; background: var(--acento); color: #fff; cursor: pointer; }
        button:disabled { opacity: .5; cursor: default; }
      </style>
    </main>`;
}
