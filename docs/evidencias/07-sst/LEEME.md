# Verificación con SST 2.0 (herramienta del product owner)

Informes generados con los módulos y las funciones de exportación de SST 2.0 (`reports/html_report.py` y
`reports/json_report.py`) el 17 de noviembre de 2026, con el proyecto en ejecución y tras corregir DEF-16.

| Archivo | Objetivo | Hallazgos |
|---|---|---|
| `ensayo-sst-frontend-4200.html` / `.json` | `http://localhost:4200/` | 6 informativos (rutas de navegación de la SPA) |
| `ensayo-sst-backend-8080.html` / `.json` | `http://localhost:8080/` | 0 |

Antes de corregir DEF-16, SST reportó 14 hallazgos en el frontend (2 medios, 2 bajos y 10 informativos) y 2 en
la API (1 medio y 1 bajo).

## Sobre los indicadores informativos del frontend

Al principio SST señalaba 10 rutas que respondían HTTP 200. Cuatro eran archivos sensibles (`/.env`, `/.git/HEAD`,
`/phpinfo.php`, `/config.php.bak`): no existían, pero ahora el servidor responde 404 a cualquier archivo oculto o con
extensión de servidor o de respaldo, y el módulo "Archivos expuestos" pasó a PASS. Las seis restantes (`/admin/`,
`/dashboard/`, `/usuarios/`, `/users/`, `/api/`, `/private/`) son rutas de navegación: el servidor de Angular
devuelve la propia página de la aplicación (`<title>RADAR</title>`), que muestra el login o su página 404, como
corresponde a una aplicación de página única. No exponen datos: la API responde 401/403 sin sesión o sin el rol
adecuado (pruebas CN-12 y CN-15). Se mantienen para no romper la navegación directa y se revisan manualmente.

## Cómo reproducir

1. Levantar el proyecto (frontend en 4200 y backend en 8080). Si el proyecto está detenido, SST marca módulos
   como PASS sin haber revisado ninguna ruta.
2. En CMD: `python app.py` dentro de la carpeta de SST.
3. Escribir la URL local, pulsar "Iniciar auditoría" y luego "Exportar HTML".
