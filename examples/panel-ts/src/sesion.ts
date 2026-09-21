/**
 * La sesión: lo que hay antes de dejar entrar a nadie.
 *
 * El "servidor" es una promesa con retardo. Lo que importa aquí no es de dónde
 * salen los datos, sino que la vista tenga que aguantar lo de siempre: una
 * espera, un fallo, y un estado que cambia debajo mientras el usuario mira.
 */

export interface Sesion {
  usuario: string;
  nombre: string;
  rol: "admin" | "operador";
}

const CUENTAS: Record<string, { clave: string; nombre: string; rol: Sesion["rol"] }> = {
  ana: { clave: "ascua", nombre: "Ana Ferreira", rol: "admin" },
  luis: { clave: "ascua", nombre: "Luis Miranda", rol: "operador" },
};

export class ErrorDeAcceso extends Error {}

/** Comprueba las credenciales. Tarda, como tardaría de verdad. */
export function iniciarSesion(usuario: string, clave: string): Promise<Sesion> {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      const cuenta = CUENTAS[usuario.trim().toLowerCase()];
      if (!cuenta || cuenta.clave !== clave) {
        rechazar(new ErrorDeAcceso("Usuario o contraseña incorrectos."));
        return;
      }
      resolver({ usuario: usuario.trim().toLowerCase(), nombre: cuenta.nombre, rol: cuenta.rol });
    }, 600);
  });
}
