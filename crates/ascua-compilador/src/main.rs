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

    let fuente = match leer(argumentos.first().map(String::as_str)) {
        Ok(fuente) => fuente,
        Err(error) => return fallar(&format!("no se pudo leer la entrada: {error}")),
    };

    match ascua_compilador::compilar(&fuente) {
        Ok(salida) => {
            if let Err(error) = io::stdout().write_all(salida.as_bytes()) {
                return fallar(&format!("no se pudo escribir la salida: {error}"));
            }
            ExitCode::SUCCESS
        }
        Err(error) => fallar(&error.to_string()),
    }
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
    -h, --help            muestra esta ayuda
    -V, --version         muestra la versión";
