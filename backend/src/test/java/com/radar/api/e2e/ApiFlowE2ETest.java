package com.radar.api.e2e;

import com.radar.api.support.ApiTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Flujos de extremo a extremo a nivel de API (sin navegador): recorren varias capas y endpoints encadenados
 * tal como lo hace el frontend. Se ejecutan en CI sobre H2; la version con navegador real y PostgreSQL esta
 * en /e2e (Playwright).
 */
@DisplayName("E2E de API - flujos completos")
class ApiFlowE2ETest extends ApiTestSupport {

    @Override
    protected String evidenceName() {
        return "e2e-api";
    }

    @Test
    @DisplayName("E2E-API-01 Ciudadano: registro -> login -> crea reporte -> listado -> heartbeat -> logout -> token revocado")
    void citizenJourney() throws Exception {
        String email = uniqueEmail("e2e.ciudadano");
        call("E2E-A01", jsonPost("/api/auth/register", registerBody("Ciudadana E2E", email, "Ciudadana123", true)))
                .andExpect(status().isCreated());
        String token = read(call("E2E-A01", jsonPost("/api/auth/login", Map.of("email", email, "password", "Ciudadana123")))
                .andExpect(status().isOk()).andReturn(), "token");

        String id = read(call("E2E-A01", jsonPost("/api/reportes",
                Map.of("categoria", "BACHE", "descripcion", "Hueco en la calle 26", "latitud", 4.65, "longitud", -74.09))
                .header("Authorization", bearer(token)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.autorNombre").value("Ciudadana E2E"))
                .andReturn(), "id");

        call("E2E-A01", get("/api/reportes").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem(Integer.valueOf(id))));

        call("E2E-A01", post("/api/auth/heartbeat").header("Authorization", bearer(token)))
                .andExpect(status().isOk());

        call("E2E-A01", post("/api/auth/logout").header("Authorization", bearer(token)))
                .andExpect(status().isOk());

        call("E2E-A01", get("/api/reportes").header("Authorization", bearer(token)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("E2E-API-02 Administrador gestiona un reporte ciudadano y la accion queda auditada")
    void adminManagesReportAndAuditTrail() throws Exception {
        String citizen = registerCitizen(uniqueEmail("e2e.reporta"));
        String id = read(mvc.perform(jsonPost("/api/reportes",
                        Map.of("categoria", "ESCOMBROS", "descripcion", "Escombros en anden", "latitud", 4.6, "longitud", -74.08))
                .header("Authorization", bearer(citizen))).andReturn(), "id");
        String admin = loginAdmin();

        call("E2E-A02", patch("/api/reportes/" + id + "/estado").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content("{\"estado\":\"RESUELTO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("RESUELTO"));

        call("E2E-A02", put("/api/reportes/" + id).header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"categoria\":\"BASURA\",\"descripcion\":\"Recategorizado por el administrador\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categoria").value("BASURA"));

        call("E2E-A02", get("/api/reportes/" + id).header("Authorization", bearer(citizen)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("RESUELTO"));

        call("E2E-A02", get("/api/admin/auditoria").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].entidad", hasItem("Reporte #" + id)))
                .andExpect(jsonPath("$[*].accion", hasItem("CAMBIO_ESTADO")))
                .andExpect(jsonPath("$[*].accion", hasItem("EDICION")));

        call("E2E-A02", delete("/api/reportes/" + id).header("Authorization", bearer(admin)))
                .andExpect(status().isNoContent());
        call("E2E-A02", get("/api/reportes/" + id).header("Authorization", bearer(admin)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("E2E-API-03 Sesion unica estricta: el segundo dispositivo es rechazado hasta que el primero cierra sesion")
    void strictSingleSessionAcrossDevices() throws Exception {
        String email = uniqueEmail("e2e.sesion");
        mvc.perform(jsonPost("/api/auth/register", registerBody("Sesion", email, CITIZEN_PASSWORD, true)));
        Map<String, Object> creds = Map.of("email", email, "password", CITIZEN_PASSWORD);

        String deviceA = read(call("E2E-A03", jsonPost("/api/auth/login", creds)).andExpect(status().isOk()).andReturn(), "token");
        call("E2E-A03", post("/api/auth/heartbeat").header("Authorization", bearer(deviceA))).andExpect(status().isOk());

        call("E2E-A03", jsonPost("/api/auth/login", Map.of("email", email, "password", CITIZEN_PASSWORD, "force", true)))
                .andExpect(status().isConflict());

        call("E2E-A03", post("/api/auth/logout").header("Authorization", bearer(deviceA))).andExpect(status().isOk());

        String deviceB = track(read(call("E2E-A03", jsonPost("/api/auth/login", creds))
                .andExpect(status().isOk()).andReturn(), "token"));
        call("E2E-A03", get("/api/reportes").header("Authorization", bearer(deviceA))).andExpect(status().isUnauthorized());
        call("E2E-A03", get("/api/reportes").header("Authorization", bearer(deviceB))).andExpect(status().isOk());
    }

    @Test
    @DisplayName("E2E-API-04 Administrador da de alta a otro administrador y este puede iniciar sesion")
    void adminOnboardsAnotherAdmin() throws Exception {
        String admin = loginAdmin();
        String email = uniqueEmail("e2e.admin2");
        call("E2E-A04", jsonPost("/api/admin/administradores", registerBody("Segundo Admin", email, "SegundoAdmin1", true))
                .header("Authorization", bearer(admin)))
                .andExpect(status().isCreated());

        track(read(call("E2E-A04", jsonPost("/api/auth/login", Map.of("email", email, "password", "SegundoAdmin1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN")).andReturn(), "token"));
    }
}
