//! El idioma de los errores del compilador.
//!
//! Los lee quien desarrolla. El compilador no lee el entorno por su cuenta:
//! en WebAssembly no hay variables de entorno, así que el idioma lo decide
//! quien llama —`ascuac` desde `LANG`, el plugin de Vite con la misma regla—
//! y vale mientras dura la compilación.

use std::cell::Cell;

/// En qué idioma salen los errores. Por defecto, español.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Idioma {
    #[default]
    Es,
    En,
}

impl Idioma {
    /// `"en"`, `"en-US"`, `"en_US.UTF-8"` → inglés; lo demás, español.
    #[must_use]
    pub fn de_codigo(codigo: &str) -> Self {
        if codigo.to_ascii_lowercase().starts_with("en") {
            Self::En
        } else {
            Self::Es
        }
    }

    /// Como cualquier herramienta de línea de comandos: `LC_ALL`,
    /// `LC_MESSAGES` o `LANG`. Español sin indicación o con `es*`, `C` o
    /// `POSIX`; inglés con cualquier otro.
    #[must_use]
    pub fn del_entorno() -> Self {
        let lang = ["LC_ALL", "LC_MESSAGES", "LANG"]
            .iter()
            .find_map(|v| std::env::var(v).ok().filter(|s| !s.is_empty()))
            .unwrap_or_default();
        let espanol = lang.is_empty()
            || lang.to_ascii_lowercase().starts_with("es")
            || ["C", "POSIX"]
                .iter()
                .any(|c| lang == *c || lang.starts_with(&format!("{c}.")));
        if espanol {
            Self::Es
        } else {
            Self::En
        }
    }
}

thread_local! {
    static ACTUAL: Cell<Idioma> = const { Cell::new(Idioma::Es) };
}

/// El idioma de la compilación en curso.
pub(crate) fn actual() -> Idioma {
    ACTUAL.with(Cell::get)
}

/// Corre `f` con `idioma`, y deja el anterior al salir.
pub(crate) fn con<T>(idioma: Idioma, f: impl FnOnce() -> T) -> T {
    let anterior = ACTUAL.with(|a| a.replace(idioma));
    let resultado = f();
    ACTUAL.with(|a| a.set(anterior));
    resultado
}

/// Un mensaje en los dos idiomas, con los argumentos de `format!`.
macro_rules! msg {
    ($es:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::idioma::actual() == $crate::idioma::Idioma::En {
            format!($en $(, $arg)*)
        } else {
            format!($es $(, $arg)*)
        }
    };
}

pub(crate) use msg;
