//! El idioma de los errores de la macro.
//!
//! Los lee quien desarrolla, así que siguen a `LANG` como cualquier
//! herramienta de línea de comandos —la misma regla que los errores de build
//! del kit—: español sin indicación o con `es*`, `C` o `POSIX`; inglés con
//! cualquier otro. Se lee al expandir; un crate con errores se vuelve a
//! compilar siempre, así que el idioma nunca queda viejo.

/// `true` si los mensajes van en inglés.
pub fn ingles() -> bool {
    let lang = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|v| std::env::var(v).ok().filter(|s| !s.is_empty()))
        .unwrap_or_default();
    !lang.is_empty()
        && !lang.to_ascii_lowercase().starts_with("es")
        && !["C", "POSIX"]
            .iter()
            .any(|c| lang == *c || lang.starts_with(&format!("{c}.")))
}

/// Un mensaje en los dos idiomas, con los argumentos de `format!`.
macro_rules! msg {
    ($es:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::mensajes::ingles() {
            format!($en $(, $arg)*)
        } else {
            format!($es $(, $arg)*)
        }
    };
}

pub(crate) use msg;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decide_como_el_kit() {
        // Un solo test: las variables de entorno son del proceso entero.
        let caso = |lang: &str| {
            std::env::remove_var("LC_ALL");
            std::env::remove_var("LC_MESSAGES");
            std::env::set_var("LANG", lang);
            ingles()
        };
        assert!(!caso(""));
        assert!(!caso("es_CL.UTF-8"));
        assert!(!caso("C"));
        assert!(!caso("POSIX.UTF-8"));
        assert!(caso("en_US.UTF-8"));
        assert!(caso("fr_FR.UTF-8"));
        std::env::set_var("LC_ALL", "es_ES.UTF-8");
        assert!(!ingles());
        std::env::remove_var("LC_ALL");
    }
}
