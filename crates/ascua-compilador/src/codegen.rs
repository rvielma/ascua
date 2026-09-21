//! De la plantilla a operaciones de DOM.
//!
//! No se genera ninguna estructura intermedia: ni árbol de descripción, ni
//! objetos de "elemento virtual". La plantilla se convierte en la secuencia
//! literal de llamadas que construyen el árbol, más un efecto por cada punto
//! que lee un signal.
//!
//! El resultado está pensado para **leerse**. Si el output de un compilador no
//! se puede entender, la magia ha vuelto por la puerta de atrás.

use std::collections::BTreeSet;

use crate::plantilla::{Elemento, Nodo, Plantilla, Valor};

/// Funciones del runtime, con el alias con el que se importan.
const ELEMENT: (&str, &str) = ("element", "_$el");
const TEXT: (&str, &str) = ("text", "_$txt");
const DYNAMIC_TEXT: (&str, &str) = ("dynamicText", "_$dtxt");
const STATIC_ATTRIBUTE: (&str, &str) = ("staticAttribute", "_$sattr");
const ATTRIBUTE: (&str, &str) = ("attribute", "_$attr");
const ON: (&str, &str) = ("on", "_$on");
const APPEND: (&str, &str) = ("append", "_$add");

pub struct Generado {
    /// La expresión JavaScript que construye el árbol.
    pub codigo: String,
    /// Las funciones del runtime que hacen falta, ya con su alias.
    pub importes: BTreeSet<(&'static str, &'static str)>,
    /// El CSS de la plantilla, ya reescrito para aplicar solo a sus elementos.
    pub css: String,
}

/// Genera la expresión que construye la plantilla.
///
/// Si la plantilla trae un `<style>`, se calcula su scope y **cada elemento
/// recibe el atributo correspondiente**. El CSS sale por separado: no queda
/// nada de estilos en tiempo de ejecución.
#[must_use]
pub fn generar(plantilla: &Plantilla) -> Generado {
    let (scope, css) = if plantilla.css.trim().is_empty() {
        (None, String::new())
    } else {
        let atributo = format!("data-ascua-{}", ascua_css::scope_id(&plantilla.css));
        let css = ascua_css::scope_css(&plantilla.css, &atributo);
        (Some(atributo), css)
    };

    let mut generador = Generador {
        lineas: Vec::new(),
        importes: BTreeSet::new(),
        contador: 0,
        scope,
    };

    let variable = generador.nodo(&plantilla.raiz);
    let cuerpo = generador
        .lineas
        .iter()
        .map(|linea| format!("  {linea}"))
        .collect::<Vec<_>>()
        .join("\n");

    Generado {
        codigo: format!("(() => {{\n{cuerpo}\n  return {variable};\n}})()"),
        importes: generador.importes,
        css,
    }
}

struct Generador {
    lineas: Vec<String>,
    importes: BTreeSet<(&'static str, &'static str)>,
    contador: usize,
    /// Atributo de scope, si la plantilla lleva estilos.
    scope: Option<String>,
}

impl Generador {
    fn usar(&mut self, funcion: (&'static str, &'static str)) -> &'static str {
        self.importes.insert(funcion);
        funcion.1
    }

    fn siguiente_variable(&mut self) -> String {
        let nombre = format!("_n{}", self.contador);
        self.contador += 1;
        nombre
    }

    fn nodo(&mut self, nodo: &Nodo) -> String {
        match nodo {
            Nodo::Texto(texto) => {
                let variable = self.siguiente_variable();
                let txt = self.usar(TEXT);
                let literal = cadena(texto);
                self.lineas
                    .push(format!("const {variable} = {txt}({literal});"));
                variable
            }
            Nodo::Estatico(expresion) => {
                let variable = self.siguiente_variable();
                let txt = self.usar(TEXT);
                self.lineas
                    .push(format!("const {variable} = {txt}(String({expresion}));"));
                variable
            }
            Nodo::Dinamico(expresion) => {
                let variable = self.siguiente_variable();
                let dtxt = self.usar(DYNAMIC_TEXT);
                self.lineas
                    .push(format!("const {variable} = {dtxt}({expresion});"));
                variable
            }
            Nodo::Elemento(elemento) => self.elemento(elemento),
        }
    }

    fn elemento(&mut self, elemento: &Elemento) -> String {
        let variable = self.siguiente_variable();
        let el = self.usar(ELEMENT);
        let etiqueta = cadena(&elemento.etiqueta);
        self.lineas
            .push(format!("const {variable} = {el}({etiqueta});"));

        if let Some(scope) = self.scope.clone() {
            let sattr = self.usar(STATIC_ATTRIBUTE);
            let nombre = cadena(&scope);
            self.lineas
                .push(format!("{sattr}({variable}, {nombre}, \"\");"));
        }

        for atributo in &elemento.atributos {
            let nombre = cadena(&atributo.nombre);
            let linea = match &atributo.valor {
                Valor::Literal(valor) => {
                    let sattr = self.usar(STATIC_ATTRIBUTE);
                    format!("{sattr}({variable}, {nombre}, {});", cadena(valor))
                }
                Valor::Estatico(expresion) => {
                    let sattr = self.usar(STATIC_ATTRIBUTE);
                    format!("{sattr}({variable}, {nombre}, {expresion});")
                }
                Valor::Dinamico(expresion) => {
                    let attr = self.usar(ATTRIBUTE);
                    format!("{attr}({variable}, {nombre}, {expresion});")
                }
                Valor::Evento { evento, manejador } => {
                    let on = self.usar(ON);
                    format!("{on}({variable}, {}, {manejador});", cadena(evento))
                }
            };
            self.lineas.push(linea);
        }

        for hijo in &elemento.hijos {
            let hijo_variable = self.nodo(hijo);
            let add = self.usar(APPEND);
            self.lineas
                .push(format!("{add}({variable}, {hijo_variable});"));
        }

        variable
    }
}

/// Literal de cadena JavaScript, con lo justo escapado.
fn cadena(valor: &str) -> String {
    let mut salida = String::with_capacity(valor.len() + 2);
    salida.push('"');
    for c in valor.chars() {
        match c {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            _ => salida.push(c),
        }
    }
    salida.push('"');
    salida
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plantilla::{parsear, ABRE, CIERRA};

    fn compilar(entrada: &str, expresiones: &[&str]) -> Generado {
        let expresiones: Vec<String> = expresiones.iter().map(|e| (*e).to_string()).collect();
        let plantilla = parsear(entrada, &expresiones).expect("debería parsear");
        generar(&plantilla)
    }

    #[test]
    fn un_elemento_con_texto() {
        let generado = compilar("<p>Hola</p>", &[]);
        assert!(
            generado.codigo.contains("_$el(\"p\")"),
            "{}",
            generado.codigo
        );
        assert!(
            generado.codigo.contains("_$txt(\"Hola\")"),
            "{}",
            generado.codigo
        );
        assert!(
            generado.codigo.contains("_$add(_n0, _n1)"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn una_closure_produce_un_binding_reactivo() {
        let entrada = format!("<p>{ABRE}0{CIERRA}</p>");
        let generado = compilar(&entrada, &["() => count()"]);
        assert!(
            generado.codigo.contains("_$dtxt(() => count())"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn una_expresion_normal_se_evalua_una_vez() {
        let entrada = format!("<p>{ABRE}0{CIERRA}</p>");
        let generado = compilar(&entrada, &["count()"]);
        assert!(
            generado.codigo.contains("_$txt(String(count()))"),
            "{}",
            generado.codigo
        );
        assert!(!generado.codigo.contains("_$dtxt"), "{}", generado.codigo);
    }

    #[test]
    fn los_eventos_usan_el_nombre_del_dom() {
        let entrada = format!("<button onclick={ABRE}0{CIERRA}>x</button>");
        let generado = compilar(&entrada, &["() => hola()"]);
        assert!(
            generado
                .codigo
                .contains("_$on(_n0, \"click\", () => hola())"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn el_style_scopea_el_css_y_marca_los_elementos() {
        let generado = compilar(
            "<div class=\"caja\"><p>hola</p><style>.caja { color: red; } p:hover { opacity: .5 }</style></div>",
            &[],
        );

        let scope = generado
            .css
            .split("[data-ascua-")
            .nth(1)
            .and_then(|resto| resto.split(']').next())
            .expect("debería haber un scope");
        let atributo = format!("data-ascua-{scope}");

        assert!(
            generado.css.contains(&format!(".caja[{atributo}]")),
            "{}",
            generado.css
        );
        assert!(
            generado.css.contains(&format!("p[{atributo}]:hover")),
            "el atributo va antes de la pseudo-clase: {}",
            generado.css
        );
        // Los dos elementos del template llevan el scope.
        assert_eq!(
            generado.codigo.matches(&atributo).count(),
            2,
            "{}",
            generado.codigo
        );
        assert!(!generado.codigo.contains("style"), "{}", generado.codigo);
    }

    #[test]
    fn sin_style_no_hay_scope_ni_css() {
        let generado = compilar("<p>hola</p>", &[]);
        assert!(generado.css.is_empty());
        assert!(
            !generado.codigo.contains("data-ascua"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn solo_importa_lo_que_usa() {
        let generado = compilar("<hr>", &[]);
        assert_eq!(
            generado
                .importes
                .iter()
                .map(|(n, _)| *n)
                .collect::<Vec<_>>(),
            vec!["element"]
        );
    }
}
