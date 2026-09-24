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
pub mod mapa;
pub mod plantilla;
#[cfg(feature = "wasm")]
mod wasm;

use std::collections::BTreeSet;
use std::fmt;

use crate::plantilla::{ABRE, CIERRA};

/// De dónde se importa el runtime.
pub const MODULO_RUNTIME: &str = "ascua";

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
    /// Source map v3 en JSON, para que un error del navegador señale el
    /// archivo que se escribió y no el que salió del compilador. Vacío si el
    /// archivo no traía plantillas: entonces la salida **es** la entrada.
    pub mapa: String,
}

/// Compila un archivo entero.
///
/// Si no contiene plantillas, se devuelve tal cual: el compilador no toca lo
/// que no es suyo.
///
/// # Errors
/// Si alguna plantilla está mal formada.
pub fn compilar(fuente: &str) -> Result<Salida, Error> {
    compilar_con_origen(fuente, "entrada.ts")
}

/// Compila y nombra el archivo de origen en el source map.
///
/// `origen` es lo que verá quien abra las herramientas del navegador: la ruta
/// del archivo que se escribió.
///
/// # Errors
/// Si alguna plantilla está mal formada.
pub fn compilar_con_origen(fuente: &str, origen: &str) -> Result<Salida, Error> {
    let mut importes: BTreeSet<(&'static str, &'static str)> = BTreeSet::new();
    let mut hojas: Vec<String> = Vec::new();

    let (codigo, mut procedencia) = compilar_en(fuente, &mut importes, &mut hojas)?;
    if importes.is_empty() {
        return Ok(Salida {
            codigo,
            css: String::new(),
            mapa: String::new(),
        });
    }

    // La línea del import se añade arriba del todo y no viene de ningún sitio:
    // se le atribuye la primera línea del archivo, que es lo más parecido a la
    // verdad y evita un hueco en el mapa.
    procedencia.insert(0, 0);

    Ok(Salida {
        codigo: format!("{}\n{codigo}", declaracion_import(&importes)),
        css: hojas.join("\n"),
        mapa: mapa::construir(origen, fuente, &procedencia),
    })
}

/// Compila las plantillas de un fragmento de código.
///
/// Se llama también **sobre las expresiones de los huecos**, porque ahí puede
/// haber otra plantilla: el `render` de un `<For>` es el caso normal. Sin esto,
/// un `view` anidado saldría intacto al otro lado.
fn compilar_en(
    fuente: &str,
    importes: &mut BTreeSet<(&'static str, &'static str)>,
    hojas: &mut Vec<String>,
) -> Result<(String, Vec<usize>), Error> {
    let ocurrencias = escaner::buscar(fuente);
    if ocurrencias.is_empty() {
        return Ok((fuente.to_string(), mapa::lineas_propias(fuente)));
    }

    let mut codigo = String::with_capacity(fuente.len());
    // De qué línea del archivo original viene cada línea de la salida.
    let mut procedencia: Vec<usize> = Vec::new();
    let mut cursor = 0usize;

    for ocurrencia in &ocurrencias {
        // Lo que hay antes de la plantilla se copia tal cual, y cada línea se
        // corresponde con la suya.
        let previo = &fuente[cursor..ocurrencia.inicio];
        let linea_plantilla = linea_cero(fuente, ocurrencia.inicio);
        mapa::añadir(
            &mut codigo,
            &mut procedencia,
            previo,
            mapa::Origen::Copiado(linea_cero(fuente, cursor)),
        );

        // Una expresión puede traer otra plantilla dentro —el `render` de un
        // `<For>`—; sus hojas de estilo van después de la de esta plantilla,
        // que es el orden en que aparecen al leer el archivo.
        let mut hojas_internas = Vec::new();
        let mut expresiones = Vec::with_capacity(ocurrencia.expresiones.len());
        for expresion in &ocurrencia.expresiones {
            let (compilada, _) = compilar_en(expresion, importes, &mut hojas_internas)?;
            expresiones.push(compilada);
        }

        let marcada = marcar(&ocurrencia.partes);
        let saltos: Vec<usize> = ocurrencia
            .expresiones
            .iter()
            .map(|expresion| expresion.matches('\n').count())
            .collect();
        let plantilla =
            plantilla::parsear_con_saltos(&marcada, &expresiones, &saltos).map_err(|error| {
                Error {
                    mensaje: error.mensaje,
                    linea: linea_plantilla + 1,
                }
            })?;

        let generado = codegen::generar(&plantilla);
        importes.extend(generado.importes);
        if !generado.css.is_empty() {
            hojas.push(generado.css);
        }
        hojas.append(&mut hojas_internas);

        // Cada línea generada señala la línea de la plantilla que la produjo:
        // el elemento, el atributo o el prop. Un error cae donde se escribió,
        // no en el `view` de arriba.
        mapa::añadir(
            &mut codigo,
            &mut procedencia,
            &generado.codigo,
            mapa::Origen::Plantilla {
                base: linea_plantilla,
                lineas: &generado.lineas,
            },
        );
        cursor = ocurrencia.fin;
    }

    mapa::añadir(
        &mut codigo,
        &mut procedencia,
        &fuente[cursor..],
        mapa::Origen::Copiado(linea_cero(fuente, cursor)),
    );

    Ok((codigo, procedencia))
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

/// La línea (desde 0) en la que cae un byte.
///
/// Se cuentan saltos y no se usa `lines()`: ese iterador no devuelve la línea
/// vacía que deja un archivo terminado en `\n`, así que un cursor justo
/// después de un salto se atribuía a la línea anterior — y el error se
/// acumulaba trozo a trozo hasta descuadrar el source map entero.
fn linea_cero(fuente: &str, byte: usize) -> usize {
    fuente[..byte.min(fuente.len())].matches('\n').count()
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
        let fuente = r#"import { signal } from "ascua";

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
    fn compila_las_plantillas_que_van_dentro_de_un_hueco() {
        // El `render` de un <For> lleva otra plantilla: si el compilador no
        // entrara ahí, saldría un `view` sin definir al otro lado.
        let fuente = "const a = view`<ul><For each=${() => t()} key=${(x) => x.id} \
                      render=${(x) => view`<li>${x.texto}</li>`}/></ul>`;\n";
        let salida = compilar(fuente).expect("debería compilar").codigo;

        assert!(!salida.contains("view`"), "{salida}");
        assert!(salida.contains("_$list("), "{salida}");
        assert!(salida.contains("_$el(\"li\")"), "{salida}");
        // Un solo import, con todo lo que hace falta.
        assert_eq!(salida.matches("from \"ascua\"").count(), 1, "{salida}");
    }

    #[test]
    fn junta_el_css_de_las_plantillas_anidadas() {
        let fuente = "const a = view`<ul><style>ul { margin: 0; }</style>\
                      <For each=${() => t()} key=${(x) => x.id} \
                      render=${(x) => view`<li><style>li { color: red; }</style></li>`}/></ul>`;\n";
        let salida = compilar(fuente).expect("debería compilar");

        assert!(salida.css.contains("margin: 0"), "{}", salida.css);
        assert!(salida.css.contains("color: red"), "{}", salida.css);
        // En orden de aparición: primero la de fuera.
        assert!(
            salida.css.find("margin: 0") < salida.css.find("color: red"),
            "{}",
            salida.css
        );
    }

    /// Las líneas de origen que declara el mapa, en orden.
    fn lineas_del_mapa(mapa: &str) -> Vec<i64> {
        const DIGITOS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mappings = mapa
            .split("\"mappings\":\"")
            .nth(1)
            .and_then(|resto| resto.split('"').next())
            .expect("debería haber mappings");

        let mut lineas = Vec::new();
        let mut acumulado = 0i64;
        for segmento in mappings.split(';') {
            let mut valores = Vec::new();
            let mut parcial = 0i64;
            let mut desplazamiento = 0u32;
            for byte in segmento.bytes() {
                let digito = DIGITOS.iter().position(|d| *d == byte).expect("alfabeto") as i64;
                parcial += (digito & 0b1_1111) << desplazamiento;
                if digito & 0b10_0000 == 0 {
                    let negativo = parcial & 1 == 1;
                    let valor = parcial >> 1;
                    valores.push(if negativo { -valor } else { valor });
                    parcial = 0;
                    desplazamiento = 0;
                } else {
                    desplazamiento += 5;
                }
            }
            acumulado += valores[2];
            lineas.push(acumulado);
        }
        lineas
    }

    #[test]
    fn el_mapa_lleva_cada_linea_a_su_sitio() {
        let fuente = "import { signal } from \"ascua\";\n\
                      \n\
                      export function Contador() {\n\
                      const count = signal(0);\n\
                      return view`<p>${() => count()}</p>`;\n\
                      }\n";
        let salida = compilar(fuente).expect("debería compilar");
        let lineas = lineas_del_mapa(&salida.mapa);

        // La primera es el import que añade el compilador, atribuido al
        // principio del archivo.
        assert_eq!(lineas[0], 0, "{lineas:?}");
        // Las cuatro siguientes son las cuatro primeras del original, copiadas
        // tal cual.
        assert_eq!(&lineas[1..5], &[0, 1, 2, 3], "{lineas:?}");

        // Y todo lo que generó la plantilla señala a su línea (la quinta del
        // archivo, que es el índice 4).
        let generadas = salida
            .codigo
            .lines()
            .filter(|l| l.contains("_$el("))
            .count();
        assert!(generadas >= 1, "{}", salida.codigo);
        assert!(
            lineas[5..5 + generadas].iter().all(|l| *l == 4),
            "{lineas:?}"
        );
    }

    /// La línea original (desde 0) de la primera línea generada que contiene `aguja`.
    fn origen_de(salida: &Salida, aguja: &str) -> i64 {
        let lineas = lineas_del_mapa(&salida.mapa);
        let indice = salida
            .codigo
            .lines()
            .position(|l| l.contains(aguja))
            .unwrap_or_else(|| panic!("no está `{aguja}` en:\n{}", salida.codigo));
        lineas[indice]
    }

    #[test]
    fn cada_elemento_senala_su_linea_dentro_de_la_plantilla() {
        // Un error de tipos en el prop de un componente tiene que caer en la
        // línea del componente, no en la del `view`.
        let fuente = "const a = view`\n\
                      <section>\n\
                      <h2>Título</h2>\n\
                      <Metrica etiqueta=${42}/>\n\
                      <button onclick=${() => x()}>ok</button>\n\
                      </section>`;\n";
        let salida = compilar(fuente).expect("debería compilar");

        assert_eq!(origen_de(&salida, "_$el(\"section\")"), 1);
        assert_eq!(origen_de(&salida, "_$el(\"h2\")"), 2);
        assert_eq!(origen_de(&salida, "Metrica("), 3);
        assert_eq!(origen_de(&salida, "_$on("), 4);
    }

    #[test]
    fn los_huecos_de_varias_lineas_desplazan_lo_que_sigue() {
        let fuente = "const a = view`<div>\n\
                      <p onclick=${() => {\n\
                      hacer();\n\
                      }}>uno</p>\n\
                      <b>dos</b>\n\
                      </div>`;\n";
        let salida = compilar(fuente).expect("debería compilar");
        assert_eq!(origen_de(&salida, "_$el(\"b\")"), 4);
    }

    #[test]
    fn un_componente_con_props_en_varias_lineas_las_conserva() {
        let fuente = "const a = view`<div>\n\
                      <Campo\n\
                      etiqueta=\"Nombre\"\n\
                      valor=${() => nombre()}/>\n\
                      </div>`;\n";
        let salida = compilar(fuente).expect("debería compilar");
        assert_eq!(origen_de(&salida, "Campo("), 1);
        assert_eq!(origen_de(&salida, "etiqueta: \"Nombre\""), 2);
        assert_eq!(origen_de(&salida, "valor: () => nombre()"), 3);
    }

    #[test]
    fn sin_plantillas_no_hace_falta_mapa() {
        let salida = compilar("export const dos = 1 + 1;\n").expect("debería compilar");
        assert!(salida.mapa.is_empty());
    }

    #[test]
    fn el_mapa_nombra_el_archivo_que_se_le_dice() {
        let salida = compilar_con_origen("const a = view`<p>x</p>`;\n", "src/app.ts")
            .expect("debería compilar");
        assert!(
            salida.mapa.contains("\"sources\":[\"src/app.ts\"]"),
            "{}",
            salida.mapa
        );
    }

    #[test]
    fn informa_de_la_linea_al_fallar() {
        let fuente = "const a = 1;\nconst b = 2;\nconst c = view`<div><p>x</div></p>`;\n";
        let error = compilar(fuente).expect_err("debería fallar");
        assert_eq!(error.linea, 3, "{error}");
        assert!(error.mensaje.contains("no cierra"), "{error}");
    }
}
