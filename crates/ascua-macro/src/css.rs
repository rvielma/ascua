//! Salida a disco del CSS extraído por el proc-macro.
//!
//! El scoping en sí vive en `ascua-css`, compartido con el compilador de
//! plantillas de TypeScript.

use std::path::PathBuf;

pub use ascua_css::{scope_css, scope_id};

/// Directorio donde se dejan los CSS extraídos.
///
/// Se puede fijar con `ASCUA_CSS_DIR`; si no, va a `target/ascua-css` del
/// crate que se está compilando.
pub fn directorio_salida() -> Option<PathBuf> {
    if let Ok(directorio) = std::env::var("ASCUA_CSS_DIR") {
        return Some(PathBuf::from(directorio));
    }
    let manifest = std::env::var("CARGO_MANIFEST_DIR").ok()?;
    Some(PathBuf::from(manifest).join("target").join("ascua-css"))
}

/// Deja el CSS scopeado en disco. Si falla, no se rompe la compilación: el
/// código sigue siendo válido, solo faltarán los estilos, y el mensaje de la
/// macro lo dirá.
pub fn escribir(scope: &str, css: &str) -> Result<PathBuf, String> {
    let directorio = directorio_salida().ok_or("no se pudo determinar el directorio de salida")?;
    std::fs::create_dir_all(&directorio).map_err(|error| error.to_string())?;
    let ruta = directorio.join(format!("{scope}.css"));
    std::fs::write(&ruta, css).map_err(|error| error.to_string())?;
    Ok(ruta)
}
