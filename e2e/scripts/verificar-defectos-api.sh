#!/usr/bin/env bash
# Verifica por HTTP, contra un backend REAL (PostgreSQL), los defectos DEF-01..DEF-15 documentados en el informe.
# Uso: API=http://localhost:8080/api ADMIN_EMAIL=... ADMIN_PASSWORD=... bash e2e/scripts/verificar-defectos-api.sh > salida.txt
# Cada linea muestra el caso, la peticion, el codigo HTTP obtenido y el esperado tras las correcciones.
# Los tokens JWT se redactan en la salida. Requiere: bash, curl.
set -u
API="${API:-http://localhost:8080/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin.e2e@radar.test}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Define ADMIN_PASSWORD con la contrasena del administrador de pruebas}"
J='Content-Type: application/json'
T="$(date +%s)$RANDOM"
PW='Segura123'
ok=0; fail=0

http() { curl -s -o /tmp/radar_body.txt -w '%{http_code}' "$@"; }
body() { sed -E 's/"token":"[^"]+"/"token":"<JWT-redactado>"/' /tmp/radar_body.txt | cut -c1-110; }
token_of() { sed -nE 's/.*"token":"([^"]+)".*/\1/p' /tmp/radar_body.txt; }
check() { # id descripcion obtenido esperado
  local mark="OK  "; if [ "$3" = "$4" ]; then ok=$((ok+1)); else mark="FAIL"; fail=$((fail+1)); fi
  printf '%s %-7s %-52s -> HTTP %s (esperado %s) | %s\n' "$mark" "$1" "$2" "$3" "$4" "$(body)"
}
register() { http -H "$J" -d "{\"nombre\":\"$2\",\"email\":\"$1\",\"password\":\"$PW\",\"acceptDataTreatment\":true}" "$API/auth/register"; }
login() { http -H "$J" -d "{\"email\":\"$1\",\"password\":\"$2\"}" "$API/auth/login"; }
logout() { curl -s -o /dev/null -X POST -H "Authorization: Bearer $1" "$API/auth/logout"; }

echo "# Verificacion de defectos contra $API | $(date -Iseconds)"
login "$ADMIN_EMAIL" "$ADMIN_PASSWORD" >/dev/null; ADM=$(token_of)
[ -n "$ADM" ] || { echo "No se pudo iniciar sesion como administrador (respuesta: $(body))"; exit 2; }

# DEF-01: ciudadano con el correo de un administrador
s=$(http -H "$J" -H "Authorization: Bearer $ADM" -d "{\"nombre\":\"Admin V\",\"email\":\"adminv.$T@radar.test\",\"password\":\"AdminV12345\",\"acceptDataTreatment\":true}" "$API/admin/administradores"); check DEF-01 "admin crea administrador adminv.$T" "$s" 201
s=$(register "ADMINV.$T@RADAR.TEST" Impostor); check DEF-01 "ciudadano se registra con ese correo (mayusculas)" "$s" 409
s=$(login "adminv.$T@radar.test" AdminV12345); check DEF-01 "el administrador conserva su acceso" "$s" 200; logout "$(token_of)"

# DEF-02: duplicado por capitalizacion y normalizacion
s=$(register "caso.$T@radar.test" Caso); check DEF-02 "registro original" "$s" 201
s=$(register "CASO.$T@RADAR.TEST" Caso); check DEF-02 "mismo correo en MAYUSCULAS" "$s" 409
s=$(register "Mixto.$T@Radar.Test" Mixto); check DEF-02 "correo mixto se guarda en minusculas" "$(grep -q "mixto.$T@radar.test" /tmp/radar_body.txt && echo $s || echo no-normalizado)" 201

# DEF-09: el token del registro es utilizable
register "token.$T@radar.test" Token >/dev/null; RT=$(token_of)
s=$(http -H "Authorization: Bearer $RT" "$API/reportes"); check DEF-09 "token del registro -> GET /reportes" "$s" 200; logout "$RT"

login "caso.$T@radar.test" "$PW" >/dev/null; CIT=$(token_of)
# DEF-03 / DEF-04: errores del cliente
s=$(http -H "$J" -d '{"nombre": "Ana",' "$API/auth/register"); check DEF-03 "registro con JSON mal formado" "$s" 400
s=$(http -H "$J" -H "Authorization: Bearer $CIT" -d '{"categoria":"INCENDIO","descripcion":"x","latitud":4.6,"longitud":-74.1}' "$API/reportes"); check DEF-03 "reporte con categoria INCENDIO" "$s" 400
s=$(http -H "$J" -H "Authorization: Bearer $CIT" -d '{"categoria":"BACHE","descripcion":"x","latitud":"norte","longitud":-74.1}' "$API/reportes"); check DEF-03 "reporte con latitud de tipo texto" "$s" 400
s=$(http -H "Authorization: Bearer $CIT" "$API/reportes/abc"); check DEF-03 "GET /reportes/abc" "$s" 400
s=$(http -H "Authorization: Bearer $ADM" "$API/no-existe"); check DEF-04 "GET /api/no-existe (autenticado)" "$s" 404
s=$(http -X DELETE "$API/health"); check DEF-04 "DELETE /api/health" "$s" 405
# DEF-05: el administrador no crea reportes
s=$(http -H "$J" -H "Authorization: Bearer $ADM" -d '{"categoria":"BACHE","descripcion":"admin","latitud":4.6,"longitud":-74.1}' "$API/reportes"); check DEF-05 "administrador crea un reporte" "$s" 403
# DEF-07: autor de auditoria
s=$(http -H "$J" -H "Authorization: Bearer $ADM" -d '{"modulo":"REPORTES","accion":"ELIMINACION","usuario":"otra.persona (suplantado)","detalle":"x"}' "$API/admin/auditoria"); check DEF-07 "auditoria: el autor sale de la sesion" "$(grep -q suplantado /tmp/radar_body.txt && echo autor-suplantado || echo $s)" 201

# DEF-10: logout ajeno sin autenticacion
s=$(http -X POST "$API/auth/logout?emailParam=caso.$T@radar.test"); check DEF-10 "logout anonimo con ?emailParam= de otra persona" "$s" 200
s=$(http -H "Authorization: Bearer $CIT" "$API/reportes"); check DEF-10 "la victima sigue autenticada" "$s" 200
# DEF-15: token de una sesion anterior
logout "$CIT"; login "caso.$T@radar.test" "$PW" >/dev/null; CIT2=$(token_of)
s=$(http -X POST -H "Authorization: Bearer $CIT" "$API/auth/logout"); check DEF-15 "logout con el token de la sesion anterior" "$s" 200
s=$(http -H "Authorization: Bearer $CIT2" "$API/reportes"); check DEF-15 "la sesion nueva sigue activa" "$s" 200
# DEF-13: la pestana puede reclamar el candado tras el login
s=$(http -H "Authorization: Bearer $CIT2" "$API/auth/session-lock?action=claim&email=caso.$T@radar.test&tabId=pestana-1"); check DEF-13 "claim autenticado tras el login" "$s" 200
logout "$CIT2"
# DEF-11: un tercero no puede bloquear el login ajeno
register "victima.$T@radar.test" Victima >/dev/null; logout "$(token_of)"
s=$(http "$API/auth/session-lock?action=claim&email=victima.$T@radar.test&tabId=atacante"); check DEF-11 "claim anonimo sobre cuenta ajena" "$s" 401
s=$(login "victima.$T@radar.test" "$PW"); check DEF-11 "la victima inicia sesion" "$s" 200; logout "$(token_of)"
# DEF-06: primer login tras el registro
register "nuevo.$T@radar.test" Nuevo >/dev/null
s=$(login "nuevo.$T@radar.test" "$PW"); check DEF-06 "primer login inmediato tras registrarse" "$s" 200; logout "$(token_of)"

logout "$ADM"
echo
echo "# Resultado: $ok verificaciones correctas, $fail fallidas"
[ "$fail" -eq 0 ]
