//! # ascua-compilador
//!
//! Traduce las plantillas de un archivo TypeScript a operaciones directas de
//! DOM.
//!
//! El desarrollador escribe HTML con huecos:
//!
//! ```text
//! view`<button onclick=${() => count.set(count() + 1)}>
//!        Clicks: ${() => count()}
//!      </button>`
//! ```
//!
//! y el compilador emite las llamadas que lo construyen, con un efecto en cada
//! punto que lee un signal. No hay Virtual DOM porque no hace falta: la
//! relación entre el dato y su nodo queda establecida aquí, en tiempo de
//! compilación.
//!
//! El resto del archivo se copia sin tocar. Esto no es un transpilador de
//! TypeScript: es una sustitución quirúrgica.

pub mod codegen;
pub mod escaner;
pub mod plantilla;
#[cfg(feature = "wasm")]
mod wasm;

use std::collections::BTreeSet;
use std::fmt;

use crate::plantilla::{ABRE, CIERRA};

/// De dónde se importa el runtime.
pub const MODULO_RUNTIME: &str = "@ascua/runtime";

#[derive(Debug)]
pub struct Error {
    pub mensaje: String,
    /// Línea del archivo original donde está la plantilla que falló.
    pub linea: usize,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "línea {}: {}", self.linea, self.mensaje)
    }
}

impl std::error::Error for Error {}

/// El resultado de compilar un archivo.
#[derive(Debug, Default)]
pub struct Salida {
    /// El TypeScript con las plantillas ya compiladas.
    pub codigo: String,
    /// El CSS extraído de los `<style>`, ya scopeado. Vacío si no había.
    pub css: String,
}

/// Compila un archivo entero.
///
/// Si no contiene plantillas, se devuelve tal cual: el compilador no toca lo
/// que no es suyo.
///
/// # Errors
/// Si alguna plantilla está mal formada.
pub fn compilar(fuente: &str) -> Result<Salida, Error> {
    let ocurrencias = escaner::buscar(fuente);
    if ocurrencias.is_empty() {
        return Ok(Salida {
            codigo: fuente.to_string(),
            css: String::new(),
        });
    }

    let mut codigo = fuente.to_string();
    let mut importes: BTreeSet<(&'static str, &'static str)> = BTreeSet::new();
    let mut hojas: Vec<String> = Vec::new();

    // De atrás hacia adelante: así los cortes de las anteriores siguen valiendo.
    for ocurrencia in ocurrencias.iter().rev() {
        let marcada = marcar(&ocurrencia.partes);
        let plantilla =
            plantilla::parsear(&marcada, &ocurrencia.expresiones).map_err(|error| Error {
                mensaje: error.mensaje,
                linea: linea_de(fuente, ocurrencia.inicio),
            })?;

        let generado = codegen::generar(&plantilla);
        importes.extend(generado.importes);
        if !generado.css.is_empty() {
            hojas.push(generado.css);
        }
        codigo.replace_range(ocurrencia.inicio..ocurrencia.fin, &generado.codigo);
    }

    // En orden de aparición, no al revés.
    hojas.reverse();

    Ok(Salida {
        codigo: format!("{}\n{codigo}", declaracion_import(&importes)),
        css: hojas.join("\n"),
    })
}

/// Une los trozos de marcado intercalando los marcadores de hueco.
fn marcar(partes: &[String]) -> String {
    let mut salida = String::new();
    for (indice, parte) in partes.iter().enumerate() {
        salida.push_str(parte);
        if indice + 1 < partes.len() {
            salida.push(ABRE);
            salida.push_str(&indice.to_string());
            salida.push(CIERRA);
        }
    }
    salida
}

fn declaracion_import(importes: &BTreeSet<(&'static str, &'static str)>) -> String {
    let lista = importes
        .iter()
        .map(|(nombre, alias)| format!("{nombre} as {alias}"))
        .collect::<Vec<_>>()
        .join(", ");
    format!("import {{ {lista} }} from \"{MODULO_RUNTIME}\";")
}

fn linea_de(fuente: &str, byte: usize) -> usize {
    fuente[..byte.min(fuente.len())].lines().count().max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deja_intacto_un_archivo_sin_plantillas() {
        let fuente = "export const dos = 1 + 1;\n";
        let salida = compilar(fuente).expect("debería compilar");
        assert_eq!(salida.codigo, fuente);
        assert!(salida.css.is_empty());
    }

    #[test]
    fn compila_una_plantilla_y_anade_el_import() {
        let fuente = r#"import { signal } from "@ascua/runtime";

export function Contador() {
  const count = signal(0);
  return view`<button onclick=${() => count.set(count() + 1)}>Clicks: ${() => count()}</button>`;
}
"#;
        let salida = compilar(fuente).expect("debería compilar").codigo;

        assert!(salida.starts_with("import {"), "{salida}");
        assert!(salida.contains("element as _$el"), "{salida}");
        assert!(salida.contains("dynamicText as _$dtxt"), "{salida}");
        assert!(
            salida.contains("_$on(_n0, \"click\", () => count.set(count() + 1))"),
            "{salida}"
        );
        assert!(salida.contains("_$dtxt(() => count())"), "{salida}");
        // Lo que no es plantilla no se toca.
        assert!(salida.contains("const count = signal(0);"), "{salida}");
        assert!(!salida.contains("view`"), "{salida}");
    }

    #[test]
    fn compila_varias_plantillas_del_mismo_archivo() {
        let fuente = "const a = view`<p>uno</p>`;\nconst b = view`<p>dos</p>`;\n";
        let salida = compilar(fuente).expect("debería compilar").codigo;
        assert_eq!(salida.matches("_$el(\"p\")").count(), 2, "{salida}");
        assert!(!salida.contains("view`"), "{salida}");
    }

    #[test]
    fn saca_el_css_del_codigo() {
        let fuente = "const a = view`<p class=\"x\">hola<style>.x { color: red; }</style></p>`;\n";
        let salida = compilar(fuente).expect("debería compilar");

        assert!(salida.css.contains("color: red"), "{}", salida.css);
        assert!(salida.css.contains("[data-ascua-"), "{}", salida.css);
        assert!(
            !salida.codigo.contains("color: red"),
            "el CSS no va en el JS: {}",
            salida.codigo
        );
        assert!(salida.codigo.contains("data-ascua-"), "{}", salida.codigo);
    }

    #[test]
    fn informa_de_la_linea_al_fallar() {
        let fuente = "const a = 1;\nconst b = 2;\nconst c = view`<div><p>x</div></p>`;\n";
        let error = compilar(fuente).expect_err("debería fallar");
        assert_eq!(error.linea, 3, "{error}");
        assert!(error.mensaje.contains("no cierra"), "{error}");
    }
}
