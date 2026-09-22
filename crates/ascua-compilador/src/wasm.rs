//! El compilador como módulo WebAssembly.
//!
//! Esta es la forma en que Ascua se distribuye: un único `.wasm` que corre en
//! Node, Bun, Deno y en el propio navegador. No hay binarios por plataforma
//! que publicar ni `postinstall` que descargue nada —que es justo el vector
//! que stil existe para cerrar—, y el mismo artefacto sirve para un
//! playground web sin servidor.

use wasm_bindgen::prelude::*;

/// Compila un archivo y devuelve `{"code", "css", "map"}` como JSON.
///
/// `origen` es el nombre que llevará el archivo dentro del source map: la ruta
/// que verá quien abra las herramientas del navegador. Se puede omitir.
///
/// # Errors
/// El mensaje del compilador, con la línea de la plantilla que falló.
#[wasm_bindgen]
pub fn compilar_json(fuente: &str, origen: Option<String>) -> Result<String, String> {
    let nombre = origen.unwrap_or_else(|| "entrada.ts".to_string());
    let salida = crate::compilar_con_origen(fuente, &nombre).map_err(|error| error.to_string())?;
    Ok(format!(
        "{{\"code\":{},\"css\":{},\"map\":{}}}",
        json_cadena(&salida.codigo),
        json_cadena(&salida.css),
        if salida.mapa.is_empty() {
            "null".to_string()
        } else {
            salida.mapa
        }
    ))
}

/// La versión del compilador.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn json_cadena(valor: &str) -> String {
    let mut salida = String::with_capacity(valor.len() + 2);
    salida.push('"');
    for c in valor.chars() {
        match c {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            c if (c as u32) < 0x20 => salida.push_str(&format!("\\u{:04x}", c as u32)),
            c => salida.push(c),
        }
    }
    salida.push('"');
    salida
}
