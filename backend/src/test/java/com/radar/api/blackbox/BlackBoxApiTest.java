package com.radar.api.blackbox;

import com.radar.api.support.ApiTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.MediaType;

import java.util.HashMap;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Pruebas de CAJA NEGRA de la API REST de RADAR (especificacion vigente en el commit e9e1021).
 * Se disenan solo a partir del comportamiento especificado (contratos HTTP, validaciones de los DTO, reglas de
 * negocio: politica de contrasenas y sesion unica estricta), sin depender de la implementacion interna.
 * Tecnicas: particion de equivalencia (PE), analisis de valores limite (AVL) y tabla de decision (TD).
 */
@DisplayName("Caja negra - API REST")
class BlackBoxApiTest extends ApiTestSupport {

    private String citizenToken;
    private String adminToken;

    @Override
    protected String evidenceName() {
        return "caja-negra";
    }

    @BeforeEach
    void tokens() throws Exception {
        citizenToken = registerCitizen(uniqueEmail("cn"));
        adminToken = loginAdmin();
    }

    private Map<String, Object> report(Object categoria, Object descripcion, Object lat, Object lon) {
        Map<String, Object> body = new HashMap<>();
        body.put("categoria", categoria);
        body.put("descripcion", descripcion);
        body.put("latitud", lat);
        body.put("longitud", lon);
        return body;
    }

    // ---------------------------------------------------------------- Registro (PE + AVL)

    @Test
    @DisplayName("CN-01 Registro con datos validos -> 201 y rol USER")
    void registerValid() throws Exception {
        call("CN-01", jsonPost("/api/auth/register", registerBody("Ana", uniqueEmail("ana"), "Segura123", true)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("USER"));
    }

    @ParameterizedTest(name = "CN-02 Registro invalido: {0} -> 400 con error en ''{1}''")
    @CsvSource({
            "nombre vacio,                          nombre,              '',  valido@radar.test, Segura123, true",
            "email sin formato,                     email,               Ana, no-es-email,       Segura123, true",
            "email vacio,                           email,               Ana, '',                Segura123, true",
            "contrasena vacia,                      password,            Ana, valido@radar.test, '',        true",
            "contrasena de 7 caracteres (limite-1), password,            Ana, valido@radar.test, Abcd123,   true",
            "contrasena sin mayuscula,              password,            Ana, valido@radar.test, abcd1234,  true",
            "contrasena sin numero,                 password,            Ana, valido@radar.test, Abcdefgh,  true",
            "sin aceptar tratamiento de datos,      acceptDataTreatment, Ana, valido@radar.test, Segura123, false"
    })
    void registerInvalid(String caso, String field, String nombre, String email, String password, boolean consent) throws Exception {
        call("CN-02", jsonPost("/api/auth/register", registerBody(nombre, email, password, consent)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors." + field).exists());
    }

    @Test
    @DisplayName("CN-03 Registro con contrasena de exactamente 8 caracteres, mayuscula y numero (limite) -> 201")
    void registerPasswordBoundary() throws Exception {
        call("CN-03", jsonPost("/api/auth/register", registerBody("Ana", uniqueEmail("lim"), "Abcd1234", true)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("CN-04 Registro con email ya registrado (dato duplicado) -> 409")
    void registerDuplicate() throws Exception {
        String email = uniqueEmail("dup");
        registerCitizen(email);
        call("CN-04", jsonPost("/api/auth/register", registerBody("Otro", email, "Segura123", true)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CN-05 Registro con email duplicado cambiando mayusculas -> 409")
    void registerDuplicateDifferentCase() throws Exception {
        String email = uniqueEmail("case");
        registerCitizen(email);
        call("CN-05", jsonPost("/api/auth/register", registerBody("Otro", email.toUpperCase(), "Segura123", true)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CN-06 Registro de ciudadano usando el email de un administrador existente -> 409")
    void registerWithAdminEmail() throws Exception {
        String adminEmail = uniqueEmail("cn06.admin");
        mvc.perform(jsonPost("/api/admin/administradores", registerBody("Admin CN06", adminEmail, "AdminCn06123", true))
                .header("Authorization", bearer(adminToken))).andExpect(status().isCreated());

        call("CN-06", jsonPost("/api/auth/register", registerBody("Impostor", adminEmail, "Impostor123", true)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CN-06b Tras intentar registrar un ciudadano con su email, el administrador conserva el acceso -> 200")
    void adminKeepsAccessAfterEmailCollision() throws Exception {
        String adminEmail = uniqueEmail("cn06b.admin");
        mvc.perform(jsonPost("/api/admin/administradores", registerBody("Admin CN06b", adminEmail, "AdminCn06b123", true))
                .header("Authorization", bearer(adminToken))).andExpect(status().isCreated());
        mvc.perform(jsonPost("/api/auth/register", registerBody("Impostor", adminEmail, "Impostor123", true)));

        String token = track(read(call("CN-06b", jsonPost("/api/auth/login",
                        Map.of("email", adminEmail, "password", "AdminCn06b123")))
                .andExpect(status().isOk()).andReturn(), "token"));
        call("CN-06b", get("/api/admin/auditoria").header("Authorization", bearer(token))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("CN-07 Registro con JSON mal formado -> 400")
    void registerMalformedJson() throws Exception {
        call("CN-07", post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("{\"nombre\": \"Ana\","))
                .andExpect(status().isBadRequest());
    }

    // ---------------------------------------------------------------- Login y sesion unica (PE + TD)

    @Test
    @DisplayName("CN-08 Login con credenciales validas y sin sesion activa -> 200")
    void loginValid() throws Exception {
        String email = uniqueEmail("cn08");
        mvc.perform(jsonPost("/api/auth/register", registerBody("Ana", email, CITIZEN_PASSWORD, true)));
        track(read(call("CN-08", jsonPost("/api/auth/login", Map.of("email", email, "password", CITIZEN_PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("USER")).andReturn(), "token"));
    }

    @ParameterizedTest(name = "CN-09 Login con {0} -> 401 y mensaje generico")
    @CsvSource({
            "contrasena incorrecta, admin.pruebas@radar.test, Incorrecta999",
            "email no registrado,   nadie@radar.test,         Cualquiera123"
    })
    void loginInvalidCredentials(String caso, String email, String password) throws Exception {
        call("CN-09", jsonPost("/api/auth/login", Map.of("email", email, "password", password)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Email o contrasena invalidos"));
    }

    @Test
    @DisplayName("CN-09b Login con contrasena que no cumple la politica -> 400 (regla del commit 8f9348c)")
    void loginPasswordPolicy() throws Exception {
        call("CN-09b", jsonPost("/api/auth/login", Map.of("email", "alguien@radar.test", "password", "sinmayuscula1")))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CN-10 Login con campos obligatorios vacios -> 400")
    void loginEmptyFields() throws Exception {
        call("CN-10", jsonPost("/api/auth/login", Map.of("email", "", "password", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.email").exists());
    }

    @Test
    @DisplayName("CN-11 TD sesion unica estricta: R1 sin sesion -> 200; R2 sesion activa -> 409; R3 con force -> 409; R4 tras logout -> 200")
    void loginStrictSingleSessionDecisionTable() throws Exception {
        String email = uniqueEmail("td");
        mvc.perform(jsonPost("/api/auth/register", registerBody("TD", email, CITIZEN_PASSWORD, true)));
        Map<String, Object> creds = new HashMap<>(Map.of("email", email, "password", CITIZEN_PASSWORD));

        String deviceA = read(call("CN-11r1", jsonPost("/api/auth/login", creds)).andExpect(status().isOk()).andReturn(), "token");
        call("CN-11r2", jsonPost("/api/auth/login", creds)).andExpect(status().isConflict());
        creds.put("force", true);
        call("CN-11r3", jsonPost("/api/auth/login", creds)).andExpect(status().isConflict());

        mvc.perform(post("/api/auth/logout").header("Authorization", bearer(deviceA))).andExpect(status().isOk());
        creds.remove("force");
        track(read(call("CN-11r4", jsonPost("/api/auth/login", creds)).andExpect(status().isOk()).andReturn(), "token"));
    }

    // ---------------------------------------------------------------- Autenticacion / autorizacion

    @Test
    @DisplayName("CN-12 Acceso a reportes sin token -> 401 'No autenticado'")
    void reportsWithoutToken() throws Exception {
        call("CN-12", get("/api/reportes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("No autenticado"));
    }

    @Test
    @DisplayName("CN-13 Acceso a reportes con token de firma alterada -> 401")
    void reportsWithInvalidToken() throws Exception {
        // Se cambia un caracter interno de la firma (no al final: ver observacion OBS-01 del informe).
        int pos = citizenToken.lastIndexOf(".") + 5;
        char replacement = citizenToken.charAt(pos) == (char) 65 ? (char) 66 : (char) 65;
        String tampered = citizenToken.substring(0, pos) + replacement + citizenToken.substring(pos + 1);
        call("CN-13", get("/api/reportes").header("Authorization", bearer(tampered)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("CN-14 Health check publico sin autenticacion -> 200 UP")
    void healthIsPublic() throws Exception {
        call("CN-14", get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @ParameterizedTest(name = "CN-15 Ciudadano (USER) intenta {0} {1} -> 403")
    @CsvSource({
            "PATCH,  /api/reportes/1/estado",
            "PUT,    /api/reportes/1",
            "DELETE, /api/reportes/1",
            "GET,    /api/admin/auditoria",
            "GET,    /api/admin/backups",
            "POST,   /api/admin/administradores"
    })
    void citizenCannotUseAdminOperations(String method, String url) throws Exception {
        String body = switch (url) {
            case "/api/reportes/1/estado" -> "{\"estado\":\"RESUELTO\"}";
            case "/api/reportes/1" -> "{\"categoria\":\"OTRO\",\"descripcion\":\"x\"}";
            case "/api/admin/administradores" -> asJson(registerBody("X", uniqueEmail("x"), "Segura123", true));
            default -> "{}";
        };
        call("CN-15", request(org.springframework.http.HttpMethod.valueOf(method), url)
                .header("Authorization", bearer(citizenToken))
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("CN-16 Heartbeat sin token -> 401")
    void heartbeatWithoutToken() throws Exception {
        call("CN-16", post("/api/auth/heartbeat")).andExpect(status().isUnauthorized());
    }

    // ---------------------------------------------------------------- Reportes (PE + AVL)

    @Test
    @DisplayName("CN-17 Crear reporte valido -> 201 con estado inicial PENDIENTE")
    void createReportValid() throws Exception {
        call("CN-17", jsonPost("/api/reportes", report("BACHE", "Hueco profundo en la via", 4.711, -74.072))
                .header("Authorization", bearer(citizenToken)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estado").value("PENDIENTE"));
    }

    @ParameterizedTest(name = "CN-18 Coordenadas limite lat={0}, lon={1} -> HTTP {2}")
    @CsvSource({
            "-90,       0,         201",
            "90,        0,         201",
            "0,         -180,      201",
            "0,         180,       201",
            "-90.0001,  0,         400",
            "90.0001,   0,         400",
            "0,         -180.0001, 400",
            "0,         180.0001,  400"
    })
    void coordinateBoundaries(double lat, double lon, int expected) throws Exception {
        call("CN-18", jsonPost("/api/reportes", report("OTRO", "Prueba de limites", lat, lon))
                .header("Authorization", bearer(citizenToken)))
                .andExpect(status().is(expected));
    }

    @ParameterizedTest(name = "CN-19 Descripcion de {0} caracteres -> HTTP {1}")
    @CsvSource({"1, 201", "500, 201", "501, 400", "0, 400"})
    void descriptionLengthBoundaries(int length, int expected) throws Exception {
        call("CN-19", jsonPost("/api/reportes", report("BASURA", "a".repeat(length), 4.6, -74.1))
                .header("Authorization", bearer(citizenToken)))
                .andExpect(status().is(expected));
    }

    @Test
    @DisplayName("CN-20 Crear reporte sin campos obligatorios -> 400 con los 4 errores de campo")
    void createReportMissingFields() throws Exception {
        call("CN-20", jsonPost("/api/reportes", Map.of()).header("Authorization", bearer(citizenToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.categoria").exists())
                .andExpect(jsonPath("$.fieldErrors.descripcion").exists())
                .andExpect(jsonPath("$.fieldErrors.latitud").exists())
                .andExpect(jsonPath("$.fieldErrors.longitud").exists());
    }

    @Test
    @DisplayName("CN-21 Crear reporte con categoria fuera del dominio (INCENDIO) -> 400 indicando el campo")
    void createReportInvalidCategory() throws Exception {
        call("CN-21", jsonPost("/api/reportes", report("INCENDIO", "Categoria inexistente", 4.6, -74.1))
                .header("Authorization", bearer(citizenToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.categoria").exists());
    }

    @Test
    @DisplayName("CN-22 Crear reporte con latitud de tipo texto -> 400 indicando el campo")
    void createReportWrongType() throws Exception {
        call("CN-22", jsonPost("/api/reportes", report("BACHE", "Tipo incorrecto", "norte", -74.1))
                .header("Authorization", bearer(citizenToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.latitud").exists());
    }

    @Test
    @DisplayName("CN-23 Consultar reporte inexistente -> 404")
    void reportNotFound() throws Exception {
        call("CN-23", get("/api/reportes/987654").header("Authorization", bearer(citizenToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("CN-24 Consultar reporte con id no numerico -> 400")
    void reportIdWrongType() throws Exception {
        call("CN-24", get("/api/reportes/abc").header("Authorization", bearer(citizenToken)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CN-25 Administrador cambia estado con valor nulo -> 400; con valor valido -> 200")
    void adminStatusChange() throws Exception {
        String id = read(mvc.perform(jsonPost("/api/reportes", report("ZONA_OSCURA", "Poste sin luz", 4.6, -74.1))
                .header("Authorization", bearer(citizenToken))).andReturn(), "id");
        call("CN-25a", patch("/api/reportes/" + id + "/estado").header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        call("CN-25b", patch("/api/reportes/" + id + "/estado").header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"estado\":\"EN_PROGRESO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("EN_PROGRESO"));
    }

    @Test
    @DisplayName("CN-26 Administrador elimina reporte inexistente -> 404")
    void adminDeleteMissing() throws Exception {
        call("CN-26", delete("/api/reportes/987654").header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("CN-27 Administrador intenta crear un reporte (accion exclusiva del ciudadano) -> 403 controlado")
    void adminCreatesReport() throws Exception {
        call("CN-27", jsonPost("/api/reportes", report("BACHE", "Reporte creado por admin", 4.6, -74.1))
                .header("Authorization", bearer(adminToken)))
                .andExpect(status().isForbidden());
    }

    // ---------------------------------------------------------------- Administracion (AVL + PE)

    @ParameterizedTest(name = "CN-28 Intervalo de backup {0} h -> HTTP {1}")
    @CsvSource({"0, 400", "1, 200", "8760, 200", "8761, 400"})
    void backupIntervalBoundaries(int hours, int expected) throws Exception {
        call("CN-28", put("/api/admin/backups/schedule").header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":false,\"intervalHours\":" + hours + "}"))
                .andExpect(status().is(expected));
    }

    @ParameterizedTest(name = "CN-29 Confirmacion de restauracion ''{0}'' -> 400")
    @CsvSource(value = {"''", "restaurar", "RESTAURAR-YA"})
    void restoreRequiresExactConfirmation(String confirmation) throws Exception {
        call("CN-29", jsonPost("/api/admin/backups/restore-latest", Map.of("confirmation", confirmation))
                .header("Authorization", bearer(adminToken)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("CN-30 Registrar administrador valido -> 201; repetir el mismo email -> 409")
    void adminRegistersAdmin() throws Exception {
        Map<String, Object> body = registerBody("Admin Dos", uniqueEmail("adm"), "AdminDos123", true);
        call("CN-30a", jsonPost("/api/admin/administradores", body).header("Authorization", bearer(adminToken)))
                .andExpect(status().isCreated());
        call("CN-30b", jsonPost("/api/admin/administradores", body).header("Authorization", bearer(adminToken)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CN-31 Ruta inexistente con sesion valida -> 404")
    void unknownRoute() throws Exception {
        call("CN-31", get("/api/no-existe").header("Authorization", bearer(adminToken)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("CN-32 Evento de auditoria con campo usuario arbitrario -> el autor se toma de la sesion")
    void auditAuthorComesFromSession() throws Exception {
        call("CN-32", jsonPost("/api/admin/auditoria", Map.of("modulo", "REPORTES", "accion", "ELIMINACION",
                        "usuario", "otra.persona@radar.test (suplantado)", "rol", "USER", "detalle", "prueba"))
                .header("Authorization", bearer(adminToken)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.usuario").value(containsString(ADMIN_EMAIL)))
                .andExpect(jsonPath("$.rol").value("ADMIN"));
    }

    @Test
    @DisplayName("CN-33 Registro con correo en mayusculas -> se almacena normalizado en minusculas")
    void registerNormalisesEmail() throws Exception {
        String email = uniqueEmail("Mixto.Caso");
        call("CN-33", jsonPost("/api/auth/register", registerBody("Mixto", email.toUpperCase(), "Segura123", true)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email.toLowerCase()));
    }

    @Test
    @DisplayName("CN-34 Metodo HTTP no soportado (DELETE /api/health) -> 405")
    void methodNotAllowed() throws Exception {
        call("CN-34", delete("/api/health")).andExpect(status().isMethodNotAllowed());
    }

    // ---------------------------------------------------------------- Sesion: registro, logout y candado

    @Test
    @DisplayName("CN-35 El token devuelto por el registro es utilizable -> 200 al consultar reportes")
    void registerTokenIsUsable() throws Exception {
        String token = track(read(mvc.perform(jsonPost("/api/auth/register",
                registerBody("Token", uniqueEmail("cn35"), CITIZEN_PASSWORD, true))).andReturn(), "token"));
        call("CN-35", get("/api/reportes").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("CN-36 Un tercero SIN autenticacion no puede cerrar la sesion de otra persona con ?emailParam=")
    void anonymousCannotLogOutSomeoneElse() throws Exception {
        String email = uniqueEmail("cn36.victima");
        String victimToken = registerCitizen(email);

        call("CN-36a", post("/api/auth/logout").param("emailParam", email));

        call("CN-36b", get("/api/reportes").header("Authorization", bearer(victimToken)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("CN-37 Un tercero SIN autenticacion no puede bloquear el inicio de sesion ajeno reclamando el candado")
    void anonymousCannotLockSomeoneElse() throws Exception {
        String email = uniqueEmail("cn37.victima");
        mvc.perform(jsonPost("/api/auth/register", registerBody("Victima", email, CITIZEN_PASSWORD, true)));

        call("CN-37a", get("/api/auth/session-lock").param("action", "claim").param("email", email).param("tabId", "atacante"))
                .andExpect(status().isUnauthorized());

        track(read(call("CN-37b", jsonPost("/api/auth/login", Map.of("email", email, "password", CITIZEN_PASSWORD)))
                .andExpect(status().isOk()).andReturn(), "token"));
    }

    @Test
    @DisplayName("CN-39 Tras iniciar sesion, la pestana del usuario puede reclamar el candado entre navegadores -> 200")
    void ownerCanClaimLockAfterLogin() throws Exception {
        String email = uniqueEmail("cn39");
        String token = registerCitizen(email);
        call("CN-39", get("/api/auth/session-lock").param("action", "claim").param("email", email).param("tabId", "pestana-1")
                .header("Authorization", bearer(token)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("CN-40 Un token de una sesion ya cerrada no puede cerrar la sesion nueva de la misma cuenta")
    void staleTokenCannotLogOutNewSession() throws Exception {
        String email = uniqueEmail("cn40");
        String oldToken = registerCitizen(email);
        mvc.perform(post("/api/auth/logout").header("Authorization", bearer(oldToken))).andExpect(status().isOk());
        String newToken = login(email, CITIZEN_PASSWORD);

        // Una pestana antigua envia su token (ya no vigente) al cerrar: no debe cerrar la sesion nueva
        call("CN-40a", post("/api/auth/logout").header("Authorization", bearer(oldToken)));
        call("CN-40b", post("/api/auth/logout").param("token", oldToken));
        call("CN-40c", get("/api/reportes").header("Authorization", bearer(newToken))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("CN-38 Consultar el candado de una cuenta sin sesion -> 200 locked=false")
    void sessionLockCheckWithoutSession() throws Exception {
        call("CN-38", get("/api/auth/session-lock").param("action", "check").param("email", uniqueEmail("cn38")).param("tabId", "t1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locked").value(false));
    }
}
