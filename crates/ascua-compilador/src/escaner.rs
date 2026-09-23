//! Encuentra las plantillas dentro de un archivo TypeScript.
//!
//! No hace falta parsear TypeScript entero para esto, y no se hace: el
//! compilador solo necesita localizar las llamadas `` view`...` `` y quedarse
//! con lo de dentro. Todo lo demás del archivo se copia sin tocar.
//!
//! Lo que sí hay que hacer bien es **no confundirse**: un `view\`` dentro de
//! una cadena o de un comentario no es una plantilla. Por eso el escáner
//! recorre el archivo entendiendo cadenas, comentarios y plantillas anidadas.

/// Los nombres que etiquetan una plantilla.
///
/// `html` está porque las extensiones de editor que colorean marcado dentro de
/// una plantilla —lit-html, es6-string-html— buscan ese nombre. Sin él se
/// escribe HTML en gris, sin cierre de etiquetas ni autocompletado, que es una
/// de esas cosas que no se notan hasta que se tienen.
pub const ETIQUETAS: &[&str] = &["view", "html"];

/// Una llamada `` view`...` `` localizada en el archivo.
#[derive(Debug, PartialEq)]
pub struct Ocurrencia {
    /// Byte donde empieza `view`.
    pub inicio: usize,
    /// Byte siguiente al backtick de cierre.
    pub fin: usize,
    /// Los trozos de marcado, entre huecos.
    pub partes: Vec<String>,
    /// Las expresiones de los huecos, en orden.
    pub expresiones: Vec<String>,
}

/// Localiza todas las plantillas del archivo.
#[must_use]
pub fn buscar(fuente: &str) -> Vec<Ocurrencia> {
    let chars: Vec<char> = fuente.chars().collect();
    // Mapa de índice de char a índice de byte, para devolver cortes válidos.
    let bytes: Vec<usize> = fuente.char_indices().map(|(i, _)| i).collect();
    let byte_de = |indice: usize| bytes.get(indice).copied().unwrap_or(fuente.len());

    let mut ocurrencias = Vec::new();
    let mut i = 0usize;

    while i < chars.len() {
        match chars[i] {
            '/' if chars.get(i + 1) == Some(&'/') => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '/' if chars.get(i + 1) == Some(&'*') => {
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i = (i + 2).min(chars.len());
            }
            '"' | '\'' => i = saltar_cadena(&chars, i),
            '`' => i = saltar_plantilla(&chars, i),
            '/' if empieza_regex(&chars, i) => i = saltar_regex(&chars, i),
            c if es_inicio_identificador(c) => {
                let inicio = i;
                while i < chars.len() && es_identificador(chars[i]) {
                    i += 1;
                }
                let palabra: String = chars[inicio..i].iter().collect();

                let mut j = i;
                while j < chars.len() && chars[j].is_whitespace() {
                    j += 1;
                }

                // La etiqueta, pegada a un backtick y no como parte de otro
                // nombre: `miView` o `formatHtml` no son plantillas.
                let es_plantilla = ETIQUETAS.contains(&palabra.as_str())
                    && j == i
                    && chars.get(j) == Some(&'`')
                    && !inicio
                        .checked_sub(1)
                        .and_then(|k| chars.get(k))
                        .is_some_and(|c| es_identificador(*c) || *c == '.');

                if es_plantilla {
                    let (partes, expresiones, fin) = leer_partes(&chars, j);
                    ocurrencias.push(Ocurrencia {
                        inicio: byte_de(inicio),
                        fin: byte_de(fin),
                        partes,
                        expresiones,
                    });
                    i = fin;
                }
            }
            _ => i += 1,
        }
    }

    ocurrencias
}

fn es_inicio_identificador(c: char) -> bool {
    c.is_alphabetic() || c == '_' || c == '$'
}

fn es_identificador(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

/// Salta una cadena `'...'` o `"..."`, respetando escapes.
fn saltar_cadena(chars: &[char], inicio: usize) -> usize {
    let comilla = chars[inicio];
    let mut i = inicio + 1;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            c if c == comilla => return i + 1,
            _ => i += 1,
        }
    }
    i
}

/// Salta una plantilla `` `...` ``, incluidas sus interpolaciones.
fn saltar_plantilla(chars: &[char], inicio: usize) -> usize {
    let mut i = inicio + 1;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            '`' => return i + 1,
            '$' if chars.get(i + 1) == Some(&'{') => i = saltar_hueco(chars, i + 1),
            _ => i += 1,
        }
    }
    i
}

/// Salta `{...}` contando llaves y respetando cadenas y plantillas de dentro.
fn saltar_hueco(chars: &[char], llave: usize) -> usize {
    let mut profundidad = 0usize;
    let mut i = llave;
    while i < chars.len() {
        match chars[i] {
            '{' => {
                profundidad += 1;
                i += 1;
            }
            '}' => {
                profundidad -= 1;
                i += 1;
                if profundidad == 0 {
                    return i;
                }
            }
            '"' | '\'' => i = saltar_cadena(chars, i),
            '`' => i = saltar_plantilla(chars, i),
            '/' if chars.get(i + 1) == Some(&'/') => {
                while i < chars.len() && chars[i] != '\n' {
                    i += 1;
                }
            }
            '/' if chars.get(i + 1) == Some(&'*') => {
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i = (i + 2).min(chars.len());
            }
            '/' if empieza_regex(chars, i) => i = saltar_regex(chars, i),
            _ => i += 1,
        }
    }
    i
}

/// Palabras tras las que una `/` abre una expresión regular y no divide.
const ANTES_DE_REGEX: &[&str] = &[
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do",
    "else", "yield", "await",
];

/// `true` si la `/` de `i` abre una expresión regular.
///
/// JavaScript no se deja partir en tokens sin saber qué vino antes: `a / b`
/// divide y `(/"/g)` es una regex con una comilla dentro. Si el escáner las
/// confunde, toma esa comilla por el principio de una cadena y deja de ver
/// todas las plantillas que siguen. La regla es la de siempre: tras algo que
/// termina una expresión —un nombre, un número, `)` o `]`— es una división; en
/// cualquier otro caso, una regex.
fn empieza_regex(chars: &[char], i: usize) -> bool {
    if matches!(chars.get(i + 1), Some('/' | '*')) {
        return false;
    }
    let mut k = i;
    while k > 0 && chars[k - 1].is_whitespace() {
        k -= 1;
    }
    let Some(&anterior) = k.checked_sub(1).and_then(|k| chars.get(k)) else {
        return true;
    };
    if anterior == ')' || anterior == ']' {
        return false;
    }
    if es_identificador(anterior) {
        let fin = k;
        while k > 0 && es_identificador(chars[k - 1]) {
            k -= 1;
        }
        let palabra: String = chars[k..fin].iter().collect();
        return ANTES_DE_REGEX.contains(&palabra.as_str());
    }
    true
}

/// Salta `/.../flags`, con escapes y clases `[...]`, donde una `/` no cierra.
fn saltar_regex(chars: &[char], inicio: usize) -> usize {
    let mut i = inicio + 1;
    let mut en_clase = false;
    while i < chars.len() {
        match chars[i] {
            '\\' => i += 2,
            '[' => {
                en_clase = true;
                i += 1;
            }
            ']' => {
                en_clase = false;
                i += 1;
            }
            '/' if !en_clase => {
                i += 1;
                while i < chars.len() && chars[i].is_alphabetic() {
                    i += 1;
                }
                return i;
            }
            // Una regex no cruza líneas: si llega aquí, no lo era.
            '\n' => return inicio + 1,
            _ => i += 1,
        }
    }
    inicio + 1
}

/// Parte la plantilla en marcado y huecos.
fn leer_partes(chars: &[char], backtick: usize) -> (Vec<String>, Vec<String>, usize) {
    let mut partes = Vec::new();
    let mut expresiones = Vec::new();
    let mut actual = String::new();
    let mut i = backtick + 1;

    while i < chars.len() {
        match chars[i] {
            '\\' => {
                actual.push(chars[i]);
                if let Some(c) = chars.get(i + 1) {
                    actual.push(*c);
                }
                i += 2;
            }
            '`' => {
                partes.push(actual);
                return (partes, expresiones, i + 1);
            }
            '$' if chars.get(i + 1) == Some(&'{') => {
                partes.push(std::mem::take(&mut actual));
                let fin = saltar_hueco(chars, i + 1);
                // Entre `${` y el `}` final.
                let expresion: String = chars[i + 2..fin - 1].iter().collect();
                expresiones.push(expresion.trim().to_string());
                i = fin;
            }
            c => {
                actual.push(c);
                i += 1;
            }
        }
    }

    partes.push(actual);
    (partes, expresiones, i)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encuentra_una_plantilla_y_sus_huecos() {
        let fuente = "const x = view`<p>Hola ${nombre()}</p>`;";
        let encontradas = buscar(fuente);

        assert_eq!(encontradas.len(), 1);
        assert_eq!(encontradas[0].partes, vec!["<p>Hola ", "</p>"]);
        assert_eq!(encontradas[0].expresiones, vec!["nombre()"]);
        assert_eq!(
            &fuente[encontradas[0].inicio..encontradas[0].fin],
            "view`<p>Hola ${nombre()}</p>`"
        );
    }

    #[test]
    fn ignora_lo_que_parece_una_plantilla_pero_no_lo_es() {
        let fuente = r#"
            // view`<p>en un comentario</p>`
            const s = "view`<p>en una cadena</p>`";
            /* view`<p>en un bloque</p>` */
            const otro = miView`<p>otro tag</p>`;
            const bueno = view`<b>sí</b>`;
        "#;
        let encontradas = buscar(fuente);
        assert_eq!(encontradas.len(), 1);
        assert_eq!(encontradas[0].partes, vec!["<b>sí</b>"]);
    }

    #[test]
    fn soporta_llaves_y_cadenas_dentro_de_un_hueco() {
        let fuente = "view`<p onclick=${() => { set({ a: `}`.length }); }}>x</p>`";
        let encontradas = buscar(fuente);
        assert_eq!(encontradas.len(), 1);
        assert_eq!(
            encontradas[0].expresiones,
            vec!["() => { set({ a: `}`.length }); }"]
        );
    }

    #[test]
    fn html_es_lo_mismo_que_view() {
        // El alias existe para que el editor coloree el marcado; el compilador
        // no distingue.
        let fuente = "const a = html`<p>Hola ${nombre()}</p>`;";
        let encontradas = buscar(fuente);

        assert_eq!(encontradas.len(), 1);
        assert_eq!(encontradas[0].partes, vec!["<p>Hola ", "</p>"]);
        assert_eq!(encontradas[0].expresiones, vec!["nombre()"]);
    }

    #[test]
    fn un_nombre_que_acaba_en_la_etiqueta_no_lo_es() {
        let fuente = "const a = formatHtml`<p>x</p>`; const b = miView`<p>y</p>`;";
        assert!(buscar(fuente).is_empty());
    }

    #[test]
    fn el_comentario_de_las_extensiones_no_estorba() {
        // `/* HTML */` delante es lo que buscan algunas extensiones de editor;
        // para el escáner es un comentario y ya.
        let fuente = "const a = /* HTML */ view`<b>sí</b>`;";
        let encontradas = buscar(fuente);
        assert_eq!(encontradas.len(), 1);
        assert_eq!(encontradas[0].partes, vec!["<b>sí</b>"]);
    }

    #[test]
    fn una_regex_con_comillas_no_se_toma_por_cadena() {
        let fuente = r#"const a = s.replace(/"/g, "&quot;").replace(/'/g, "x");
const b = total / 2 / 3;
const c = /[/`]/.test(d) ? view`<p>1</p>` : null;
function f() { return /`/g; }
const e = view`<p>2</p>`;"#;
        let encontradas = buscar(fuente);
        assert_eq!(encontradas.len(), 2);
        assert_eq!(encontradas[0].partes, vec!["<p>1</p>"]);
        assert_eq!(encontradas[1].partes, vec!["<p>2</p>"]);
    }

    #[test]
    fn una_division_no_es_una_regex() {
        let fuente = "const x = (a) / 2; const y = z[0] / w / 4; const v = view`<b>ok</b>`;";
        assert_eq!(buscar(fuente).len(), 1);
    }

    #[test]
    fn encuentra_varias_plantillas() {
        let fuente = "const a = view`<p>1</p>`; const b = view`<p>${dos}</p>`;";
        let encontradas = buscar(fuente);
        assert_eq!(encontradas.len(), 2);
        assert_eq!(encontradas[1].expresiones, vec!["dos"]);
    }
}
