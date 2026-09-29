"""Sirve benchmarks/ con aislamiento de origen cruzado (COOP/COEP).

Sin esas dos cabeceras, `performance.now()` redondea a 0,1 ms, y las
operaciones que duran uno o dos milisegundos —quitar una fila, vaciar— salen
en escalones del 8 %. Con ellas, el reloj baja a microsegundos.

    python3 servir.py            # http://127.0.0.1:5191/
"""

import functools
import http.server
import pathlib
import sys


class Aislado(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *_):
        pass


puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 5191
carpeta = pathlib.Path(__file__).resolve().parent
servidor = http.server.ThreadingHTTPServer(("127.0.0.1", puerto), functools.partial(Aislado, directory=carpeta))
print(f"http://127.0.0.1:{puerto}/")
servidor.serve_forever()
