//! El parser de plantillas.
//!
//! Una plantilla es **HTML de verdad** con huecos. Nada de `className` ni
//! `onClick`: los atributos son los que ya conoce cualquiera que haya escrito
//! una página, y el marcado se puede copiar y pegar tal cual.
//!
//! ```text
//! view`<button class="grande" onclick=${saludar}>Hola ${() => nombre()}</button>`
//! ```
//!
//! Los huecos llegan aquí ya separados por el escáner, sustituidos por un
//! marcador que no puede aparecer en HTML (área de uso privado de Unicode).

/// Delimitadores del marcador de hueco: `\u{E000}` índice `\u{E001}`.
pub const ABRE: char = '\u{E000}';
pub const CIERRA: char = '\u{E001}';

/// Elementos HTML sin etiqueta de cierre.
const SIN_CIERRE: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr",
];

#[derive(Debug, PartialEq)]
pub enum Nodo {
    Elemento(Elemento),
    /// Texto literal del marcado.
    Texto(String),
    /// `${expr}` — se evalúa una vez, al construir.
    Estatico(String),
    /// `${() => expr}` — se reevalúa cuando cambia lo que lee.
    Dinamico(String),
}

#[derive(Debug, PartialEq)]
pub struct Elemento {
    pub etiqueta: String,
    pub atributos: Vec<Atributo>,
    pub hijos: Vec<Nodo>,
}

#[derive(Debug, PartialEq)]
pub struct Atributo {
    pub nombre: String,
    pub valor: Valor,
}

#[derive(Debug, PartialEq)]
pub enum Valor {
    /// `class="caja"`
    Literal(String),
    /// `id=${expr}` — se aplica una vez.
    Estatico(String),
    /// `class=${() => ...}` — se reevalúa; `false`/`null` quitan el atributo.
    Dinamico(String),
    /// `onclick=${manejador}`
    Evento { evento: String, manejador: String },
}

#[derive(Debug)]
pub struct Error {
    pub mensaje: String,
    pub posicion: usize,
}

impl std::error::Error for Error {}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} (posición {})", self.mensaje, self.posicion)
    }
}

type Resultado<T> = Result<T, Error>;

/// Lo que sale de parsear una plantilla.
#[derive(Debug)]
pub struct Plantilla {
    pub raiz: Nodo,
    /// El contenido de los bloques `<style>`, ya fuera del árbol.
    pub css: String,
}

/// Parsea una plantilla ya marcada.
///
/// `expresiones` son los huecos en orden: el marcador con índice N se refiere
/// a `expresiones[N]`.
///
/// # Errors
/// Si el marcado está mal formado.
pub fn parsear(entrada: &str, expresiones: &[String]) -> Resultado<Plantilla> {
    let mut parser = Parser {
        chars: entrada.chars().collect(),
        posicion: 0,
        expresiones,
        css: String::new(),
    };

    parser.saltar_espacios();
    let raiz = parser.nodo()?;
    parser.saltar_espacios();

    if parser.posicion < parser.chars.len() {
        return Err(parser.error(
            "una plantilla tiene un único elemento raíz; envuelve el contenido en un elemento",
        ));
    }
    Ok(Plantilla {
        raiz,
        css: parser.css,
    })
}

struct Parser<'a> {
    chars: Vec<char>,
    posicion: usize,
    expresiones: &'a [String],
    css: String,
}

impl Parser<'_> {
    fn error(&self, mensaje: &str) -> Error {
        Error {
            mensaje: mensaje.to_string(),
            posicion: self.posicion,
        }
    }

    fn actual(&self) -> Option<char> {
        self.chars.get(self.posicion).copied()
    }

    fn mirar(&self, adelanto: usize) -> Option<char> {
        self.chars.get(self.posicion + adelanto).copied()
    }

    fn saltar_espacios(&mut self) {
        while self.actual().is_some_and(char::is_whitespace) {
            self.posicion += 1;
        }
    }

    fn consumir(&mut self, esperado: char) -> Resultado<()> {
        if self.actual() == Some(esperado) {
            self.posicion += 1;
            Ok(())
        } else {
            Err(self.error(&format!("se esperaba `{esperado}`")))
        }
    }

    /// Un nodo: elemento, texto o hueco.
    fn nodo(&mut self) -> Resultado<Nodo> {
        match self.actual() {
            Some('<') => Ok(Nodo::Elemento(self.elemento()?)),
            Some(ABRE) => self.hueco(),
            Some(_) => Ok(Nodo::Texto(self.texto())),
            None => Err(self.error("plantilla vacía")),
        }
    }

    /// Texto literal hasta el próximo `<` o hueco.
    fn texto(&mut self) -> String {
        let inicio = self.posicion;
        while let Some(c) = self.actual() {
            if c == '<' || c == ABRE {
                break;
            }
            self.posicion += 1;
        }
        self.chars[inicio..self.posicion].iter().collect()
    }

    /// `\u{E000}N\u{E001}` — un hueco `${...}`.
    fn hueco(&mut self) -> Resultado<Nodo> {
        let expresion = self.leer_hueco()?;
        Ok(if es_closure(&expresion) {
            Nodo::Dinamico(expresion)
        } else {
            Nodo::Estatico(expresion)
        })
    }

    fn leer_hueco(&mut self) -> Resultado<String> {
        self.consumir(ABRE)?;
        let inicio = self.posicion;
        while self.actual().is_some_and(|c| c != CIERRA) {
            self.posicion += 1;
        }
        let indice: usize = self.chars[inicio..self.posicion]
            .iter()
            .collect::<String>()
            .parse()
            .map_err(|_| self.error("marcador de hueco corrupto"))?;
        self.consumir(CIERRA)?;

        self.expresiones
            .get(indice)
            .cloned()
            .ok_or_else(|| self.error("marcador de hueco fuera de rango"))
    }

    fn elemento(&mut self) -> Resultado<Elemento> {
        self.consumir('<')?;
        let etiqueta = self.nombre();
        if etiqueta.is_empty() {
            return Err(self.error("se esperaba el nombre de una etiqueta"));
        }

        let mut atributos = Vec::new();
        loop {
            self.saltar_espacios();
            match self.actual() {
                Some('>') | Some('/') | None => break,
                _ => atributos.push(self.atributo()?),
            }
        }

        // <tag/>
        if self.actual() == Some('/') {
            self.posicion += 1;
            self.consumir('>')?;
            return Ok(Elemento {
                etiqueta,
                atributos,
                hijos: Vec::new(),
            });
        }
        self.consumir('>')?;

        // El CSS no es marcado: se lee tal cual hasta </style> y se saca del
        // árbol. No genera ningún nodo ni deja nada en tiempo de ejecución.
        if etiqueta.eq_ignore_ascii_case("style") {
            self.estilo()?;
            return Ok(Elemento {
                etiqueta: String::new(),
                atributos: Vec::new(),
                hijos: Vec::new(),
            });
        }

        if SIN_CIERRE.contains(&etiqueta.to_ascii_lowercase().as_str()) {
            return Ok(Elemento {
                etiqueta,
                atributos,
                hijos: Vec::new(),
            });
        }

        let hijos = self.hijos(&etiqueta)?;
        self.consumir('<')?;
        self.consumir('/')?;
        let cierre = self.nombre();
        self.saltar_espacios();
        self.consumir('>')?;

        if !cierre.eq_ignore_ascii_case(&etiqueta) {
            return Err(self.error(&format!("</{cierre}> no cierra <{etiqueta}>")));
        }

        Ok(Elemento {
            etiqueta,
            atributos,
            hijos,
        })
    }

    /// Lee el contenido de un `<style>` sin interpretarlo como HTML.
    fn estilo(&mut self) -> Resultado<()> {
        let inicio = self.posicion;
        while self.posicion < self.chars.len() {
            if self.actual() == Some('<') && self.mirar(1) == Some('/') {
                break;
            }
            self.posicion += 1;
        }
        let css: String = self.chars[inicio..self.posicion].iter().collect();

        if css.contains(ABRE) {
            return Err(self.error(
                "el CSS de un <style> se extrae en tiempo de compilación, así que no admite \
                 interpolaciones ${...}; para estilos que cambian, usa un atributo",
            ));
        }

        self.consumir('<')?;
        self.consumir('/')?;
        let cierre = self.nombre();
        self.saltar_espacios();
        self.consumir('>')?;
        if !cierre.eq_ignore_ascii_case("style") {
            return Err(self.error(&format!("</{cierre}> no cierra <style>")));
        }

        if !self.css.is_empty() {
            self.css.push('\n');
        }
        self.css.push_str(css.trim());
        Ok(())
    }

    fn hijos(&mut self, etiqueta: &str) -> Resultado<Vec<Nodo>> {
        let mut hijos = Vec::new();
        loop {
            match self.actual() {
                None => {
                    return Err(self.error(&format!("falta la etiqueta de cierre </{etiqueta}>")))
                }
                Some('<') if self.mirar(1) == Some('/') => return Ok(hijos),
                _ => {
                    let nodo = self.nodo()?;
                    // El <style> ya se guardó aparte: no produce nodo.
                    if matches!(&nodo, Nodo::Elemento(e) if e.etiqueta.is_empty()) {
                        continue;
                    }
                    // El texto que solo son espacios entre etiquetas no aporta
                    // nada y sí bytes: se descarta, como hace cualquier
                    // minificador de HTML.
                    if let Nodo::Texto(t) = &nodo {
                        if t.trim().is_empty() {
                            continue;
                        }
                    }
                    hijos.push(nodo);
                }
            }
        }
    }

    fn atributo(&mut self) -> Resultado<Atributo> {
        let nombre = self.nombre();
        if nombre.is_empty() {
            return Err(self.error("se esperaba el nombre de un atributo"));
        }
        self.saltar_espacios();

        // Atributo sin valor: `disabled`.
        if self.actual() != Some('=') {
            return Ok(Atributo {
                nombre,
                valor: Valor::Literal(String::new()),
            });
        }
        self.posicion += 1;
        self.saltar_espacios();

        let valor = match self.actual() {
            Some('"') | Some('\'') => Valor::Literal(self.literal()?),
            Some(ABRE) => {
                let expresion = self.leer_hueco()?;
                // Los eventos son atributos `on*`, como en HTML.
                if let Some(evento) = nombre.strip_prefix("on") {
                    Valor::Evento {
                        evento: evento.to_ascii_lowercase(),
                        manejador: expresion,
                    }
                } else if es_closure(&expresion) {
                    Valor::Dinamico(expresion)
                } else {
                    Valor::Estatico(expresion)
                }
            }
            _ => return Err(self.error("el valor de un atributo va entre comillas o en ${}")),
        };

        Ok(Atributo { nombre, valor })
    }

    fn literal(&mut self) -> Resultado<String> {
        let comilla = self
            .actual()
            .ok_or_else(|| self.error("literal sin abrir"))?;
        self.posicion += 1;
        let inicio = self.posicion;
        while self.actual().is_some_and(|c| c != comilla) {
            self.posicion += 1;
        }
        let valor: String = self.chars[inicio..self.posicion].iter().collect();
        self.consumir(comilla)?;
        Ok(valor)
    }

    /// Nombre de etiqueta o atributo: admite `-` y `:` como el HTML.
    fn nombre(&mut self) -> String {
        let inicio = self.posicion;
        while self
            .actual()
            .is_some_and(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == ':')
        {
            self.posicion += 1;
        }
        self.chars[inicio..self.posicion].iter().collect()
    }
}

/// ¿La expresión es una función flecha?
///
/// Es **la regla del framework**: una closure es reactiva, cualquier otra
/// expresión se evalúa una vez. Se decide mirando solo el principio, así que
/// es predecible: `() => x` y `n => x` sí; `f(() => x)` no, porque empieza por
/// `f`.
pub fn es_closure(expresion: &str) -> bool {
    let texto = expresion.trim_start();

    // `async () => ...`
    let texto = texto.strip_prefix("async").map_or(texto, str::trim_start);

    if let Some(resto) = texto.strip_prefix('(') {
        // `(...) => `: hay que saltar hasta el paréntesis que cierra.
        let mut profundidad = 1usize;
        for (indice, c) in resto.char_indices() {
            match c {
                '(' => profundidad += 1,
                ')' => {
                    profundidad -= 1;
                    if profundidad == 0 {
                        return resto[indice + 1..].trim_start().starts_with("=>");
                    }
                }
                _ => {}
            }
        }
        return false;
    }

    // `nombre => ...`
    let identificador: String = texto
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
        .collect();
    if identificador.is_empty() {
        return false;
    }
    texto[identificador.len()..].trim_start().starts_with("=>")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsear_simple(entrada: &str, expresiones: &[&str]) -> Nodo {
        let expresiones: Vec<String> = expresiones.iter().map(|e| (*e).to_string()).collect();
        parsear(entrada, &expresiones)
            .expect("debería parsear")
            .raiz
    }

    #[test]
    fn distingue_closures_de_valores() {
        assert!(es_closure("() => count()"));
        assert!(es_closure("(ev) => algo(ev)"));
        assert!(es_closure("ev => algo(ev)"));
        assert!(es_closure("  async () => x"));
        assert!(!es_closure("count()"));
        assert!(!es_closure("f(() => x)"));
        assert!(!es_closure("\"texto\""));
        assert!(!es_closure("obj.prop"));
    }

    #[test]
    fn parsea_un_elemento_con_texto() {
        let nodo = parsear_simple("<p>Hola</p>", &[]);
        assert_eq!(
            nodo,
            Nodo::Elemento(Elemento {
                etiqueta: "p".into(),
                atributos: vec![],
                hijos: vec![Nodo::Texto("Hola".into())],
            })
        );
    }

    #[test]
    fn distingue_atributos_estaticos_dinamicos_y_eventos() {
        let nodo = parsear_simple(
            "<button class=\"base\" id=\u{E000}0\u{E001} data-x=\u{E000}1\u{E001} onclick=\u{E000}2\u{E001}/>",
            &["idFijo", "() => activo()", "manejar"],
        );

        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.atributos[0].valor, Valor::Literal("base".into()));
        assert_eq!(
            elemento.atributos[1].valor,
            Valor::Estatico("idFijo".into())
        );
        assert_eq!(
            elemento.atributos[2].valor,
            Valor::Dinamico("() => activo()".into())
        );
        assert_eq!(
            elemento.atributos[3].valor,
            Valor::Evento {
                evento: "click".into(),
                manejador: "manejar".into()
            }
        );
    }

    #[test]
    fn descarta_los_espacios_entre_etiquetas() {
        let nodo = parsear_simple("<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 2);
    }

    #[test]
    fn los_elementos_sin_cierre_no_lo_necesitan() {
        let nodo = parsear_simple("<div><br><img src=\"x.png\"></div>", &[]);
        let Nodo::Elemento(elemento) = nodo else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 2);
    }

    #[test]
    fn extrae_el_css_y_lo_saca_del_arbol() {
        let plantilla = parsear(
            "<div><p>hola</p><style>.caja { color: red; }</style></div>",
            &[],
        )
        .expect("debería parsear");

        assert_eq!(plantilla.css, ".caja { color: red; }");
        let Nodo::Elemento(elemento) = plantilla.raiz else {
            panic!("debería ser un elemento");
        };
        assert_eq!(elemento.hijos.len(), 1, "el <style> no deja nodo");
    }

    #[test]
    fn rechaza_interpolaciones_dentro_del_css() {
        let entrada = format!("<div><style>.c {{ color: {ABRE}0{CIERRA}; }}</style></div>");
        let error = parsear(&entrada, &["rojo".into()]).expect_err("debería fallar");
        assert!(error.mensaje.contains("interpolaciones"), "{error}");
    }

    #[test]
    fn rechaza_una_plantilla_con_dos_raices() {
        let error = parsear("<p>a</p><p>b</p>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("único elemento raíz"), "{error}");
    }

    #[test]
    fn rechaza_un_cierre_que_no_corresponde() {
        let error = parsear("<div><p>a</div></p>", &[]).expect_err("debería fallar");
        assert!(error.mensaje.contains("no cierra"), "{error}");
    }
}
