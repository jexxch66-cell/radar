package com.radar.api.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Soporte comun para pruebas a nivel HTTP: levanta la aplicacion completa (filtros de seguridad,
 * controladores, servicios, JPA) sobre H2 y registra cada peticion/respuesta como evidencia en
 * target/evidencias/http-*.log (sin tokens ni contrasenas).
 */
// Las propiedades inline tienen mas precedencia que las variables de entorno del sistema operativo,
// asi las pruebas no dependen de RECAPTCHA_ENABLED / GOOGLE_CLIENT_ID definidos en la maquina o el runner.
@SpringBootTest(properties = {
        "recaptcha.enabled=false",
        "recaptcha.secret-key=",
        "google.client-id=test-client-id.apps.googleusercontent.com"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class ApiTestSupport {

    public static final String ADMIN_EMAIL = "admin.pruebas@radar.test";
    public static final String ADMIN_PASSWORD = "AdminPruebas123!";
    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;

    /** Nombre del archivo de evidencia (uno por clase de prueba). */
    protected abstract String evidenceName();

    protected static String uniqueEmail(String prefix) {
        return prefix + "." + System.nanoTime() + "." + SEQ.incrementAndGet() + "@radar.test";
    }

    protected ResultActions call(String caseId, MockHttpServletRequestBuilder builder) throws Exception {
        ResultActions actions = mvc.perform(builder);
        MvcResult result = actions.andReturn();
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("\"token\":\"[^\"]+\"", "\"token\":\"<JWT-redactado>\"");
        if (body.length() > 220) {
            body = body.substring(0, 220) + "...";
        }
        String line = String.format("%-8s %-6s %-42s -> HTTP %d | %s%n", caseId,
                result.getRequest().getMethod(), result.getRequest().getRequestURI(),
                result.getResponse().getStatus(), body);
        Path file = Path.of("target", "evidencias", "http-" + evidenceName() + ".log");
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ignored) {
            // la evidencia es auxiliar; nunca debe romper la prueba
        }
        return actions;
    }

    protected MockHttpServletRequestBuilder jsonPost(String url, Object body) throws Exception {
        return post(url).contentType(MediaType.APPLICATION_JSON).content(asJson(body));
    }

    protected String asJson(Object body) throws Exception {
        return body instanceof String s ? s : json.writeValueAsString(body);
    }

    protected Map<String, Object> registerBody(String nombre, String email, String password, boolean consent) {
        return Map.of("nombre", nombre, "email", email, "password", password, "acceptDataTreatment", consent);
    }

    /** Contrasena de los ciudadanos de prueba (cumple la politica: 8+ caracteres, mayuscula y numero). */
    protected static final String CITIZEN_PASSWORD = "Ciudadano123";

    /** Tokens emitidos durante la prueba; se cierran al final para no dejar sesiones activas (bloqueo estricto). */
    private final List<String> openSessions = new ArrayList<>();

    @AfterEach
    void closeOpenSessions() throws Exception {
        for (String token : openSessions) {
            mvc.perform(post("/api/auth/logout").header("Authorization", bearer(token)));
        }
        openSessions.clear();
    }

    /** Registra un ciudadano e inicia sesion como lo hace el frontend (registro -> login); devuelve su JWT. */
    protected String registerCitizen(String email) throws Exception {
        mvc.perform(jsonPost("/api/auth/register", registerBody("Ciudadano Prueba", email, CITIZEN_PASSWORD, true)));
        return login(email, CITIZEN_PASSWORD);
    }

    /** Inicia sesion y registra el token para cerrarlo al terminar la prueba. */
    protected String login(String email, String password) throws Exception {
        MvcResult result = mvc.perform(jsonPost("/api/auth/login", Map.of("email", email, "password", password))).andReturn();
        String token = read(result, "token");
        if (token != null) {
            openSessions.add(token);
        }
        return token;
    }

    /** Marca un token obtenido por otra via (p. ej. un login hecho dentro de la prueba) para cerrarlo al final. */
    protected String track(String token) {
        if (token != null) {
            openSessions.add(token);
        }
        return token;
    }

    /** Inicia sesion como administrador semilla. */
    protected String loginAdmin() throws Exception {
        return login(ADMIN_EMAIL, ADMIN_PASSWORD);
    }

    protected String read(MvcResult result, String field) throws Exception {
        JsonNode node = json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return node.path(field).asText(null);
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }
}
