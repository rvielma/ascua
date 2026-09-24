# Benchmark

Ascua frente a vanilla, Solid y React, en las operaciones de
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark).
Los resultados y el método están en
[la documentación](https://ascua.gitweave.run/docs/rendimiento/).

```sh
for d in vanilla ascua solid react; do
  (cd $d && stil install && stil exec vite build)
done
bash ../scripts/enlazar-paquetes.sh
python3 -m http.server 5191 --directory .
# http://localhost:5191/ → «correr», o en la consola:
#   await correr({ rondas: 3, vueltas: 15, calentamiento: 5 })
```

| | |
|---|---|
| `comun/arnes.js` | Las operaciones, cómo se mide cada una y la comprobación del DOM. |
| `comun/datos.js` | Los datos, iguales para todos. |
| `index.html` | La orquesta: rondas intercaladas y factores sobre vanilla. |
| `resultados/` | Cada medición publicada, con la máquina y las versiones. |
# Benchmark

Ascua frente a vanilla, Solid y React, en las operaciones de
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark).
Los resultados y el método están en
[la documentación](https://ascua.gitweave.run/docs/rendimiento/).

```sh
for d in vanilla ascua solid react; do
  (cd $d && stil install && stil exec vite build)
done
bash ../scripts/enlazar-paquetes.sh
python3 -m http.server 5191 --directory .
# http://localhost:5191/ → «correr», o en la consola:
#   await correr({ rondas: 3, vueltas: 15, calentamiento: 5 })
```

| | |
|---|---|
| `comun/arnes.js` | Las operaciones, cómo se mide cada una y la comprobación del DOM. |
| `comun/datos.js` | Los datos, iguales para todos. |
| `index.html` | La orquesta: rondas intercaladas y factores sobre vanilla. |
| `resultados/` | Cada medición publicada, con la máquina y las versiones. |
