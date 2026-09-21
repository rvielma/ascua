//! Scoping de CSS en tiempo de compilación.
//!
//! Lo usan los dos compiladores de Ascua —el proc-macro de Rust y el de
//! plantillas de TypeScript—, porque el problema es el mismo en ambos: un
//! bloque de estilos tiene que aplicar solo a los elementos de su plantilla.
//!
//! Un bloque `<style>` dentro de un `view!` no genera **nada** en tiempo de
//! ejecución: ni un `<style>` inyectado, ni una llamada a `insertRule`, ni un
//! runtime de estilos. La macro hace tres cosas durante la compilación:
//!
//! 1. Calcula un identificador de scope a partir del contenido del bloque.
//! 2. Reescribe cada selector para que solo case con los elementos de *este*
//!    template: `.tarjeta` pasa a ser `.tarjeta[data-ascua-a1b2c3d4]`.
//! 3. Escribe el CSS resultante a un archivo, que el paso de build recoge.
//!
//! El atributo se añade a los elementos del template, no al contenido de los
//! componentes que use dentro: el CSS de un componente no se filtra a sus
//! hijos, que es justo lo que se espera de un scope.

use std::fmt::Write as _;

/// Identificador estable derivado del contenido: el mismo CSS produce siempre
/// el mismo scope, así que recompilar no ensucia el directorio de salida.
pub fn scope_id(css: &str) -> String {
    // FNV-1a de 64 bits. No hace falta resistencia criptográfica, solo que
    // colisiones sean improbables y el resultado reproducible.
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in css.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:08x}")[..8].to_string()
}

/// Reescribe el CSS para que solo aplique a los elementos marcados con
/// `atributo`.
pub fn scope_css(css: &str, atributo: &str) -> String {
    let mut salida = String::new();
    escribir_reglas(css, atributo, &mut salida);
    salida
}

fn escribir_reglas(entrada: &str, atributo: &str, salida: &mut String) {
    let bytes = entrada.as_bytes();
    let mut posicion = 0;
    let mut inicio_prelude = 0;

    while posicion < bytes.len() {
        if bytes[posicion] != b'{' {
            posicion += 1;
            continue;
        }

        let prelude = entrada[inicio_prelude..posicion].trim();
        let Some((cuerpo, fin)) = leer_bloque(entrada, posicion) else {
            break; // llave sin cerrar: se deja lo que quede tal cual
        };

        if prelude.starts_with('@') {
            if contiene_reglas_anidadas(prelude) {
                let _ = writeln!(salida, "{prelude} {{");
                escribir_reglas(cuerpo, atributo, salida);
                salida.push_str("}\n");
            } else {
                // @keyframes, @font-face: no llevan selectores que scopear.
                let _ = writeln!(salida, "{prelude} {{{cuerpo}}}");
            }
        } else {
            let selectores = scope_selectores(prelude, atributo);
            let _ = writeln!(salida, "{selectores} {{{cuerpo}}}");
        }

        posicion = fin;
        inicio_prelude = fin;
    }
}

/// At-rules cuyo bloque contiene reglas completas, no declaraciones.
fn contiene_reglas_anidadas(prelude: &str) -> bool {
    let nombre = prelude
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        nombre.as_str(),
        "@media" | "@supports" | "@container" | "@layer" | "@scope"
    )
}

/// Devuelve el contenido entre la llave de `apertura` y su cierre, más la
/// posición siguiente al cierre.
fn leer_bloque(entrada: &str, apertura: usize) -> Option<(&str, usize)> {
    let bytes = entrada.as_bytes();
    let mut profundidad = 0usize;
    let mut posicion = apertura;

    while posicion < bytes.len() {
        match bytes[posicion] {
            b'{' => profundidad += 1,
            b'}' => {
                profundidad -= 1;
                if profundidad == 0 {
                    return Some((&entrada[apertura + 1..posicion], posicion + 1));
                }
            }
            _ => {}
        }
        posicion += 1;
    }
    None
}

fn scope_selectores(prelude: &str, atributo: &str) -> String {
    prelude
        .split(',')
        .map(|selector| scope_selector(selector.trim(), atributo))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Añade el atributo al **último** componente del selector, que es el elemento
/// que la regla acaba seleccionando. En `.lista li:hover`, el atributo va a
/// `li`, y antes de la pseudo-clase: `.lista li[data-x]:hover`.
fn scope_selector(selector: &str, atributo: &str) -> String {
    if selector.is_empty() {
        return String::new();
    }

    let inicio_ultimo = selector
        .rfind([' ', '>', '+', '~'])
        .map_or(0, |posicion| posicion + 1);
    let (prefijo, ultimo) = selector.split_at(inicio_ultimo);

    let corte = ultimo.find(':').unwrap_or(ultimo.len());
    let (base, pseudo) = ultimo.split_at(corte);
    format!("{prefijo}{base}[{atributo}]{pseudo}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_scope_es_estable_y_depende_del_contenido() {
        assert_eq!(scope_id(".a { color: red }"), scope_id(".a { color: red }"));
        assert_ne!(
            scope_id(".a { color: red }"),
            scope_id(".a { color: blue }")
        );
        assert_eq!(scope_id("").len(), 8);
    }

    #[test]
    fn scopea_selectores_simples_y_listas() {
        let css = scope_css(".tarjeta, h1 { color: red; }", "data-x");
        assert_eq!(css.trim(), ".tarjeta[data-x], h1[data-x] { color: red; }");
    }

    #[test]
    fn scopea_el_ultimo_elemento_del_selector() {
        let css = scope_css(".lista li > span { color: red; }", "data-x");
        assert_eq!(css.trim(), ".lista li > span[data-x] { color: red; }");
    }

    #[test]
    fn coloca_el_atributo_antes_de_la_pseudoclase() {
        let css = scope_css("button:hover { color: red; }", "data-x");
        assert_eq!(css.trim(), "button[data-x]:hover { color: red; }");
    }

    #[test]
    fn scopea_dentro_de_una_media_query() {
        let css = scope_css(
            "@media (min-width: 40rem) { .app { display: flex; } }",
            "data-x",
        );
        assert!(
            css.contains(".app[data-x] { display: flex; }"),
            "reglas dentro de @media deben scopearse: {css}"
        );
        assert!(css.contains("@media (min-width: 40rem) {"));
    }

    #[test]
    fn no_toca_los_keyframes() {
        let css = scope_css("@keyframes girar { from { opacity: 0; } }", "data-x");
        assert!(
            !css.contains("[data-x]"),
            "los pasos de un keyframe no son selectores: {css}"
        );
    }
}
