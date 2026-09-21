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

use crate::plantilla::{Componente, Elemento, Nodo, Plantilla, Valor, ELSE, FOR, SHOW};

/// Funciones del runtime, con el alias con el que se importan.
const ELEMENT: (&str, &str) = ("element", "_$el");
const TEXT: (&str, &str) = ("text", "_$txt");
const DYNAMIC_TEXT: (&str, &str) = ("dynamicText", "_$dtxt");
const STATIC_ATTRIBUTE: (&str, &str) = ("staticAttribute", "_$sattr");
const ATTRIBUTE: (&str, &str) = ("attribute", "_$attr");
const PROPERTY: (&str, &str) = ("property", "_$prop");
const ON: (&str, &str) = ("on", "_$on");
const APPEND: (&str, &str) = ("append", "_$add");
const SHOW_FN: (&str, &str) = ("show", "_$show");
const LIST_FN: (&str, &str) = ("list", "_$list");

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
        importes: BTreeSet::new(),
        contador: 0,
        nivel: 1,
        scope,
    };

    let mut lineas = Vec::new();
    let variable = generador.nodo(&plantilla.raiz, &mut lineas);
    lineas.push(generador.linea(&format!("return {variable};")));

    Generado {
        codigo: format!("(() => {{\n{}\n}})()", lineas.join("\n")),
        importes: generador.importes,
        css,
    }
}

struct Generador {
    importes: BTreeSet<(&'static str, &'static str)>,
    contador: usize,
    /// Profundidad de anidamiento, solo para que el output se lea.
    nivel: usize,
    /// Atributo de scope, si la plantilla lleva estilos.
    scope: Option<String>,
}

impl Generador {
    fn usar(&mut self, funcion: (&'static str, &'static str)) -> &'static str {
        self.importes.insert(funcion);
        funcion.1
    }

    fn linea(&self, texto: &str) -> String {
        format!("{}{texto}", "  ".repeat(self.nivel))
    }

    /// Una expresión del usuario, lista para incrustar.
    ///
    /// Si trae otra plantilla dentro —el `render` de un `<For>` es el caso
    /// normal—, viene ya compilada y en varias líneas, y hay que alinearla con
    /// el punto donde entra. Un compilador cuyo output no se puede leer es
    /// magia con otro nombre.
    fn expresion(&self, valor: &Valor) -> String {
        self.sangrar(&expresion_de(valor))
    }

    fn sangrar(&self, texto: &str) -> String {
        if texto.contains('\n') {
            texto.replace('\n', &format!("\n{}", "  ".repeat(self.nivel)))
        } else {
            texto.to_string()
        }
    }

    fn siguiente_variable(&mut self) -> String {
        let nombre = format!("_n{}", self.contador);
        self.contador += 1;
        nombre
    }

    /// Construye un nodo y devuelve la variable que lo contiene.
    fn nodo(&mut self, nodo: &Nodo, lineas: &mut Vec<String>) -> String {
        match nodo {
            Nodo::Texto(texto) => {
                let variable = self.siguiente_variable();
                let txt = self.usar(TEXT);
                let literal = cadena(texto);
                lineas.push(self.linea(&format!("const {variable} = {txt}({literal});")));
                variable
            }
            Nodo::Estatico(expresion) => {
                let variable = self.siguiente_variable();
                let txt = self.usar(TEXT);
                let expresion = self.sangrar(expresion);
                lineas.push(self.linea(&format!("const {variable} = {txt}(String({expresion}));")));
                variable
            }
            Nodo::Dinamico(expresion) => {
                let variable = self.siguiente_variable();
                let dtxt = self.usar(DYNAMIC_TEXT);
                let expresion = self.sangrar(expresion);
                lineas.push(self.linea(&format!("const {variable} = {dtxt}({expresion});")));
                variable
            }
            Nodo::Elemento(elemento) => self.elemento(elemento, lineas),
            Nodo::Componente(componente) => self.componente(componente, lineas),
        }
    }

    fn elemento(&mut self, elemento: &Elemento, lineas: &mut Vec<String>) -> String {
        let variable = self.siguiente_variable();
        let el = self.usar(ELEMENT);
        let etiqueta = cadena(&elemento.etiqueta);
        lineas.push(self.linea(&format!("const {variable} = {el}({etiqueta});")));

        if let Some(scope) = self.scope.clone() {
            let sattr = self.usar(STATIC_ATTRIBUTE);
            let nombre = cadena(&scope);
            lineas.push(self.linea(&format!("{sattr}({variable}, {nombre}, \"\");")));
        }

        for atributo in &elemento.atributos {
            let nombre = cadena(&atributo.nombre);
            let texto = match &atributo.valor {
                Valor::Literal(valor) => {
                    let sattr = self.usar(STATIC_ATTRIBUTE);
                    format!("{sattr}({variable}, {nombre}, {});", cadena(valor))
                }
                Valor::Estatico(expresion) => {
                    let sattr = self.usar(STATIC_ATTRIBUTE);
                    let expresion = self.sangrar(expresion);
                    format!("{sattr}({variable}, {nombre}, {expresion});")
                }
                Valor::Dinamico(expresion) => {
                    let attr = self.usar(ATTRIBUTE);
                    let expresion = self.sangrar(expresion);
                    format!("{attr}({variable}, {nombre}, {expresion});")
                }
                Valor::Propiedad(expresion) => {
                    // La regla de siempre: una closure sigue al signal, y
                    // cualquier otra expresión se escribe una vez. Sin closure
                    // no hace falta ni un efecto ni una llamada al runtime.
                    let sangrada = self.sangrar(expresion);
                    if crate::plantilla::es_closure(expresion) {
                        let prop = self.usar(PROPERTY);
                        format!("{prop}({variable}, {nombre}, {sangrada});")
                    } else {
                        format!("{variable}[{nombre}] = {sangrada};")
                    }
                }
                Valor::Evento { evento, manejador } => {
                    let on = self.usar(ON);
                    let manejador = self.sangrar(manejador);
                    format!("{on}({variable}, {}, {manejador});", cadena(evento))
                }
            };
            lineas.push(self.linea(&texto));
        }

        self.hijos(&elemento.hijos, &variable, lineas);
        variable
    }

    /// Añade los hijos a su padre.
    ///
    /// `<Show>` y `<For>` no producen un nodo que colgar: producen un marcador
    /// y un efecto que inserta y quita alrededor de él. Por eso se resuelven
    /// aquí, donde se conoce el padre, y no en `nodo`.
    fn hijos(&mut self, hijos: &[Nodo], padre: &str, lineas: &mut Vec<String>) {
        for hijo in hijos {
            match hijo {
                Nodo::Componente(componente) if componente.nombre == SHOW => {
                    self.show(componente, padre, lineas);
                }
                Nodo::Componente(componente) if componente.nombre == FOR => {
                    self.lista(componente, padre, lineas);
                }
                _ => {
                    let variable = self.nodo(hijo, lineas);
                    let add = self.usar(APPEND);
                    lineas.push(self.linea(&format!("{add}({padre}, {variable});")));
                }
            }
        }
    }

    /// `<Panel titulo=${t}>…</Panel>` — una llamada a función y nada más.
    ///
    /// El componente recibe un objeto de props y devuelve un nodo. Se puede
    /// escribir a mano exactamente igual: la plantilla no da acceso a nada que
    /// no esté ya al alcance de quien la escribe.
    fn componente(&mut self, componente: &Componente, lineas: &mut Vec<String>) -> String {
        let variable = self.siguiente_variable();
        let mut campos: Vec<String> = componente
            .props
            .iter()
            .map(|prop| format!("{}: {}", clave(&prop.nombre), self.expresion(&prop.valor)))
            .collect();

        if !componente.hijos.is_empty() {
            let receta = self.receta(&componente.hijos);
            campos.push(format!("children: {receta}"));
        }

        let props = if campos.is_empty() {
            "{}".to_string()
        } else {
            format!("{{ {} }}", campos.join(", "))
        };
        lineas.push(self.linea(&format!(
            "const {variable} = {}({props});",
            componente.nombre
        )));
        variable
    }

    /// Los hijos de un componente, como **receta**: una función que recibe el
    /// padre y los construye dentro.
    ///
    /// No son nodos ya hechos a propósito. El componente decide dónde van, y
    /// si van: un `<Show>` dentro del contenido necesita un padre real donde
    /// anclar su marcador, y aquí lo tiene.
    fn receta(&mut self, hijos: &[Nodo]) -> String {
        let padre = format!("_p{}", self.contador);
        self.contador += 1;

        self.nivel += 1;
        let mut internas = Vec::new();
        self.hijos(hijos, &padre, &mut internas);
        self.nivel -= 1;

        format!(
            "({padre}) => {{\n{}\n{}}}",
            internas.join("\n"),
            "  ".repeat(self.nivel)
        )
    }

    /// `<Show>` — una región que se sustituye entera.
    fn show(&mut self, componente: &Componente, padre: &str, lineas: &mut Vec<String>) {
        let when = componente
            .prop("when")
            .map_or_else(|| "false".to_string(), |valor| self.expresion(valor));

        let (entonces, si_no): (Vec<&Nodo>, Vec<&Nodo>) = particionar_ramas(&componente.hijos);

        let condicion = format!("_c{}", self.contador);
        self.contador += 1;

        let rama_si = self.rama(&entonces);
        let rama_no = self.rama(&si_no);

        let show = self.usar(SHOW_FN);
        lineas.push(self.linea(&format!(
            "{show}({padre}, {when}, ({condicion}) => {condicion} ? {rama_si} : {rama_no});"
        )));
    }

    /// Una rama de `<Show>`: los nodos ya construidos, o `null` si no hay.
    ///
    /// Se construye dentro de la función, no fuera: el contenido de la rama
    /// que no se muestra **no existe** —ni sus nodos ni sus efectos— hasta que
    /// le toca.
    fn rama(&mut self, hijos: &[&Nodo]) -> String {
        if hijos.is_empty() {
            return "null".to_string();
        }

        self.nivel += 1;
        let mut internas = Vec::new();
        let variables: Vec<String> = hijos
            .iter()
            .map(|hijo| self.nodo(hijo, &mut internas))
            .collect();
        let devuelto = if let [unica] = variables.as_slice() {
            unica.clone()
        } else {
            format!("[{}]", variables.join(", "))
        };
        internas.push(self.linea(&format!("return {devuelto};")));
        self.nivel -= 1;

        format!(
            "(() => {{\n{}\n{}}})()",
            internas.join("\n"),
            "  ".repeat(self.nivel)
        )
    }

    /// `<For>` — lista con clave.
    fn lista(&mut self, componente: &Componente, padre: &str, lineas: &mut Vec<String>) {
        let each = componente
            .prop("each")
            .map_or_else(|| "() => []".to_string(), |valor| self.expresion(valor));
        let key = componente.prop("key").map_or_else(
            || "(item) => item".to_string(),
            |valor| self.expresion(valor),
        );
        let render = componente
            .prop("render")
            .map_or_else(|| "() => null".to_string(), |valor| self.expresion(valor));

        let list = self.usar(LIST_FN);
        lineas.push(self.linea(&format!("{list}({padre}, {each}, {key}, {render});")));
    }
}

/// Separa el contenido de un `<Show>` de su `<Else>`.
fn particionar_ramas(hijos: &[Nodo]) -> (Vec<&Nodo>, Vec<&Nodo>) {
    let mut entonces = Vec::new();
    let mut si_no = Vec::new();

    for hijo in hijos {
        match hijo {
            Nodo::Componente(componente) if componente.nombre == ELSE => {
                si_no.extend(componente.hijos.iter());
            }
            otro => entonces.push(otro),
        }
    }
    (entonces, si_no)
}

/// El valor de un prop, tal como se escribió.
fn expresion_de(valor: &Valor) -> String {
    match valor {
        Valor::Literal(texto) => cadena(texto),
        Valor::Estatico(expresion) | Valor::Dinamico(expresion) | Valor::Propiedad(expresion) => {
            expresion.clone()
        }
        Valor::Evento { manejador, .. } => manejador.clone(),
    }
}

/// Clave de objeto: entre comillas solo si el nombre lo necesita.
fn clave(nombre: &str) -> String {
    let identificador = !nombre.is_empty()
        && !nombre.starts_with(|c: char| c.is_ascii_digit())
        && nombre
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');

    if identificador {
        nombre.to_string()
    } else {
        cadena(nombre)
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
    fn un_componente_es_una_llamada_a_funcion() {
        let entrada = format!("<div><Panel titulo=\"Sesión\" abierto={ABRE}0{CIERRA}/></div>");
        let generado = compilar(&entrada, &["activo()"]);
        assert!(
            generado
                .codigo
                .contains("Panel({ titulo: \"Sesión\", abierto: activo() })"),
            "{}",
            generado.codigo
        );
        // Un componente no es un elemento: no se crea ninguna etiqueta suya.
        assert!(
            !generado.codigo.contains("_$el(\"Panel\")"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn a_un_componente_los_props_le_llegan_tal_cual() {
        // `onguardar` es un prop del componente, no un listener del DOM.
        let entrada = format!("<div><Aviso onguardar={ABRE}0{CIERRA}/></div>");
        let generado = compilar(&entrada, &["() => guardar()"]);
        assert!(
            generado
                .codigo
                .contains("Aviso({ onguardar: () => guardar() })"),
            "{}",
            generado.codigo
        );
        assert!(!generado.codigo.contains("_$on"), "{}", generado.codigo);
    }

    #[test]
    fn los_hijos_de_un_componente_son_una_receta_con_su_padre() {
        let generado = compilar("<div><Panel><p>dentro</p></Panel></div>", &[]);
        let codigo = &generado.codigo;
        // La receta recibe el padre y construye dentro: no son nodos sueltos.
        assert!(codigo.contains("children: (_p"), "{codigo}");
        assert!(codigo.contains("_$el(\"p\")"), "{codigo}");
    }

    #[test]
    fn show_produce_una_region_con_sus_dos_ramas() {
        let entrada =
            format!("<div><Show when={ABRE}0{CIERRA}><p>sí</p><Else><p>no</p></Else></Show></div>");
        let generado = compilar(&entrada, &["() => activo()"]);
        let codigo = &generado.codigo;

        assert!(codigo.contains("_$show(_n0, () => activo()"), "{codigo}");
        assert!(codigo.contains("? (() => {"), "{codigo}");
        assert!(codigo.contains(") : (() => {"), "{codigo}");
        // Las dos ramas se construyen dentro de su función: la que no se
        // muestra no existe todavía.
        assert_eq!(codigo.matches("_$el(\"p\")").count(), 2, "{codigo}");
    }

    #[test]
    fn un_show_sin_else_no_pone_nada_en_la_otra_rama() {
        let entrada = format!("<div><Show when={ABRE}0{CIERRA}><p>sí</p></Show></div>");
        let generado = compilar(&entrada, &["() => activo()"]);
        assert!(generado.codigo.contains(" : null)"), "{}", generado.codigo);
    }

    #[test]
    fn una_rama_con_varios_nodos_los_devuelve_juntos() {
        let entrada = format!("<div><Show when={ABRE}0{CIERRA}><p>uno</p><p>dos</p></Show></div>");
        let generado = compilar(&entrada, &["() => activo()"]);
        assert!(
            generado.codigo.contains("return [_n2, _n4];"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn for_es_la_lista_con_clave_del_runtime() {
        let entrada = format!(
            "<ul><For each={ABRE}0{CIERRA} key={ABRE}1{CIERRA} render={ABRE}2{CIERRA}/></ul>"
        );
        let generado = compilar(
            &entrada,
            &["() => tareas()", "(t) => t.id", "(t) => construir(t)"],
        );
        assert!(
            generado
                .codigo
                .contains("_$list(_n0, () => tareas(), (t) => t.id, (t) => construir(t));"),
            "{}",
            generado.codigo
        );
    }

    #[test]
    fn una_propiedad_reactiva_no_es_un_atributo() {
        let entrada = format!("<input prop:value={ABRE}0{CIERRA}>");
        let generado = compilar(&entrada, &["() => texto()"]);
        assert!(
            generado
                .codigo
                .contains("_$prop(_n0, \"value\", () => texto())"),
            "{}",
            generado.codigo
        );
        assert!(!generado.codigo.contains("_$attr"), "{}", generado.codigo);
    }

    #[test]
    fn una_propiedad_sin_closure_se_escribe_una_vez() {
        let entrada = format!("<input prop:value={ABRE}0{CIERRA}>");
        let generado = compilar(&entrada, &["inicial"]);
        assert!(
            generado.codigo.contains("_n0[\"value\"] = inicial;"),
            "{}",
            generado.codigo
        );
        // Sin closure no hay efecto, así que no se importa nada para esto.
        assert!(
            !generado
                .importes
                .iter()
                .any(|(nombre, _)| *nombre == "property"),
            "{:?}",
            generado.importes
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
