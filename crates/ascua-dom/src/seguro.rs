//! Lo que no se escribe tal cual cuando llega por una expresión.
//!
//! Es la misma red que el runtime de TypeScript (`dom.ts`): una URL
//! `javascript:` en un atributo que el navegador ejecuta, y un `srcdoc` sin
//! `sandbox`. Lo escrito literal en el `view!` no pasa por aquí: eso lo decidió
//! quien escribió el código.

use std::borrow::Cow;

use crate::backend::Backend;

/// Atributos que el navegador puede ejecutar como código si llevan una URL
/// `javascript:`: un enlace, un formulario, un iframe.
const ATRIBUTOS_URL: [&str; 6] = ["href", "xlink:href", "src", "action", "formaction", "data"];

/// Lo que queda en lugar de una URL bloqueada: no navega ni ejecuta nada útil.
const BLOQUEADA: &str = "javascript:throw new Error('Ascua bloqueó una URL javascript:')";

/// Como lo lee el navegador: ignora espacios y controles delante, y tabs y
/// saltos de línea en medio (`java\tscript:` también es `javascript:`).
fn es_javascript(valor: &str) -> bool {
    let mut letras = valor
        .trim_start_matches(|c: char| c == ' ' || c <= '\u{1F}')
        .chars()
        .filter(|c| !matches!(c, '\t' | '\n' | '\r'));
    "javascript:".chars().all(|esperada| {
        letras
            .next()
            .is_some_and(|c| c.eq_ignore_ascii_case(&esperada))
    })
}

/// `srcdoc` solo se escribe si el `<iframe>` ya tiene `sandbox`, y no con
/// `allow-scripts` y `allow-same-origin` juntos, que le dejan quitárselo.
fn sandbox_basta(sandbox: Option<&str>) -> bool {
    let Some(sandbox) = sandbox else {
        return false;
    };
    let tiene = |permiso: &str| {
        sandbox
            .split_ascii_whitespace()
            .any(|p| p.eq_ignore_ascii_case(permiso))
    };
    !(tiene("allow-scripts") && tiene("allow-same-origin"))
}

/// El valor que se escribe en `name` cuando llega por una expresión.
pub(crate) fn valor_seguro<'a, B: Backend>(
    backend: &B,
    node: &B::Node,
    name: &str,
    value: &'a str,
) -> Cow<'a, str> {
    if name.eq_ignore_ascii_case("srcdoc") {
        if sandbox_basta(backend.attribute(node, "sandbox").as_deref()) {
            return Cow::Borrowed(value);
        }
        backend.warn(
            "Ascua bloqueó un `srcdoc` sin `sandbox`. Escribe `sandbox` literal en el <iframe> \
             (sin `allow-scripts` y `allow-same-origin` juntos).",
        );
        return Cow::Borrowed("");
    }
    if ATRIBUTOS_URL.iter().any(|a| a.eq_ignore_ascii_case(name)) && es_javascript(value) {
        backend.warn(&format!(
            "Ascua bloqueó una URL javascript: en `{name}`. Si viene de datos externos, \
             valídala; si es tuya, escríbela literal en la plantilla."
        ));
        return Cow::Borrowed(BLOQUEADA);
    }
    Cow::Borrowed(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconoce_javascript_como_el_navegador() {
        for url in [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            " javascript:alert(1)",
            "\u{1}javascript:alert(1)",
            "java\tscript:alert(1)",
            "java\nscript:alert(1)",
        ] {
            assert!(es_javascript(url), "{url:?}");
        }
        for url in [
            "https://flow.cl",
            "/javascript:",
            "mailto:a@b.cl",
            "javascript",
            "jav",
        ] {
            assert!(!es_javascript(url), "{url:?}");
        }
    }

    #[test]
    fn sandbox_que_basta() {
        assert!(!sandbox_basta(None));
        assert!(!sandbox_basta(Some("allow-same-origin  ALLOW-SCRIPTS")));
        assert!(sandbox_basta(Some("")));
        assert!(sandbox_basta(Some("allow-scripts")));
        assert!(sandbox_basta(Some("allow-same-origin allow-forms")));
    }
}
