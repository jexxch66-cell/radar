# Verificación con SST 2.0 (herramienta del product owner)

Informes generados con los módulos y las funciones de exportación de SST 2.0 (`reports/html_report.py` y
`reports/json_report.py`) el 17 de noviembre de 2026, con el proyecto en ejecución y tras corregir DEF-16.

| Archivo | Objetivo | Hallazgos |
|---|---|---|
| `ensayo-sst-frontend-4200.html` / `.json` | `http://localhost:4200/` | 10 informativos (falsos positivos) |
| `ensayo-sst-backend-8080.html` / `.json` | `http://localhost:8080/` | 0 |

Antes de corregir DEF-16, SST reportó 14 hallazgos en el frontend (2 medios, 2 bajos y 10 informativos) y 2 en
la API (1 medio y 1 bajo).

## Sobre los 10 indicadores informativos del frontend

SST señala rutas como `/.env`, `/.git/HEAD`, `/phpinfo.php`, `/config.php.bak` o `/admin/` porque responden
HTTP 200. El servidor de Angular devuelve la propia página de la aplicación (`<title>RADAR</title>`) para
cualquier ruta, como corresponde a una aplicación de página única: esos archivos no existen y los datos están
protegidos por la API, que responde 401/403 sin sesión o sin el rol adecuado (pruebas CN-12 y CN-15).

## Cómo reproducir

1. Levantar el proyecto (frontend en 4200 y backend en 8080). Si el proyecto está detenido, SST marca módulos
   como PASS sin haber revisado ninguna ruta.
2. En CMD: `python app.py` dentro de la carpeta de SST.
3. Escribir la URL local, pulsar "Iniciar auditoría" y luego "Exportar HTML".
