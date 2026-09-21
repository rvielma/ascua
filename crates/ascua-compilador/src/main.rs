//! `ascuac` — el compilador de plantillas de Ascua.
//!
//! Lee TypeScript por la entrada estándar o de un archivo, y escribe por la
//! salida estándar el mismo código con las plantillas ya compiladas. Está
//! pensado para que lo llame un bundler (hay un plugin de Vite), pero también
//! sirve para mirar qué genera:
//!
//! ```sh
//! ascuac src/contador.ts
//! cat src/contador.ts | ascuac
//! ```

use std::io::{self, Read, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let argumentos: Vec<String> = std::env::args().skip(1).collect();

    if argumentos.iter().any(|a| a == "-h" || a == "--help") {
        println!("{}", AYUDA);
        return ExitCode::SUCCESS;
    }
    if argumentos.iter().any(|a| a == "-V" || a == "--version") {
        println!("ascuac {}", env!("CARGO_PKG_VERSION"));
        return ExitCode::SUCCESS;
    }

    // La ruta es el primer argumento que no sea una opción; si no hay, se lee
    // de la entrada estándar.
    let ruta = argumentos
        .iter()
        .find(|argumento| !argumento.starts_with('-'))
        .map(String::as_str);

    let fuente = match leer(ruta) {
        Ok(fuente) => fuente,
        Err(error) => return fallar(&format!("no se pudo leer la entrada: {error}")),
    };

    let json = argumentos.iter().any(|a| a == "--json");

    match ascua_compilador::compilar(&fuente) {
        Ok(salida) => {
            // Con --json salen el código y el CSS juntos, que es lo que
            // necesita un bundler para emitir la hoja de estilos.
            let texto = if json {
                format!(
                    "{{\"code\":{},\"css\":{}}}",
                    json_cadena(&salida.codigo),
                    json_cadena(&salida.css)
                )
            } else {
                salida.codigo
            };

            if let Err(error) = io::stdout().write_all(texto.as_bytes()) {
                return fallar(&format!("no se pudo escribir la salida: {error}"));
            }
            ExitCode::SUCCESS
        }
        Err(error) => fallar(&error.to_string()),
    }
}

/// Serializa una cadena como literal JSON. Es lo único de JSON que hace falta
/// aquí, así que no entra una dependencia por ello.
fn json_cadena(valor: &str) -> String {
    let mut salida = String::with_capacity(valor.len() + 2);
    salida.push('"');
    for c in valor.chars() {
        match c {
            '"' => salida.push_str("\\\""),
            '\\' => salida.push_str("\\\\"),
            '\n' => salida.push_str("\\n"),
            '\r' => salida.push_str("\\r"),
            '\t' => salida.push_str("\\t"),
            c if (c as u32) < 0x20 => salida.push_str(&format!("\\u{:04x}", c as u32)),
            c => salida.push(c),
        }
    }
    salida.push('"');
    salida
}

fn leer(ruta: Option<&str>) -> io::Result<String> {
    match ruta {
        Some(ruta) => std::fs::read_to_string(ruta),
        None => {
            let mut fuente = String::new();
            io::stdin().read_to_string(&mut fuente)?;
            Ok(fuente)
        }
    }
}

fn fallar(mensaje: &str) -> ExitCode {
    eprintln!("ascuac: {mensaje}");
    ExitCode::FAILURE
}

const AYUDA: &str = "\
ascuac — compila las plantillas de Ascua a operaciones de DOM

USO:
    ascuac [ARCHIVO]      compila ARCHIVO (o la entrada estándar) a stdout

OPCIONES:
        --json            escribe {\"code\", \"css\"} en vez de solo el código
    -h, --help            muestra esta ayuda
    -V, --version         muestra la versión";
