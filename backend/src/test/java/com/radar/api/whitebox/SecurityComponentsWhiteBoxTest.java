package com.radar.api.whitebox;

import com.radar.api.config.JwtAuthenticationFilter;
import com.radar.api.model.AuditLog;
import com.radar.api.repository.AuditLogRepository;
import com.radar.api.service.AuditLogService;
import com.radar.api.service.GoogleTokenService;
import com.radar.api.service.JwtService;
import com.radar.api.service.RecaptchaService;
import com.radar.api.service.UserDetailsServiceImpl;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.security.SignatureException;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Pruebas de CAJA BLANCA de componentes de seguridad: JwtService, JwtAuthenticationFilter,
 * RecaptchaService, GoogleTokenService (rama de configuracion) y AuditLogService (valores por defecto).
 */
class SecurityComponentsWhiteBoxTest {

    private static final String SECRET = "clave-de-prueba-cb-suficientemente-larga-hmac-256";

    static JwtService jwt(String secret, long expirationMs) {
        JwtService service = new JwtService();
        ReflectionTestUtils.setField(service, "secret", secret);
        ReflectionTestUtils.setField(service, "expirationMs", expirationMs);
        return service;
    }

    static final UserDetails USER = User.withUsername("cb@radar.test").password("x").roles("USER").build();

    @Nested
    @DisplayName("JwtService")
    class JwtServiceCases {

        @Test
        @DisplayName("CB-JWT-01 token expirado: el parser lanza ExpiredJwtException")
        void expiredTokenIsRejected() {
            JwtService service = jwt(SECRET, -1_000L);
            String token = service.generateToken(USER, "sid");

            assertThrows(ExpiredJwtException.class, () -> service.extractUsername(token));
            assertThrows(ExpiredJwtException.class, () -> service.isTokenValid(token, USER, "sid"));
        }

        @Test
        @DisplayName("CB-JWT-02 token firmado con otra clave: SignatureException")
        void tokenSignedWithAnotherKeyIsRejected() {
            String foreign = jwt("otra-clave-distinta-de-al-menos-32-caracteres!!", 60_000L).generateToken(USER, "sid");

            assertThrows(SignatureException.class, () -> jwt(SECRET, 60_000L).extractUsername(foreign));
        }

        @Test
        @DisplayName("CB-JWT-03 token con payload manipulado: la firma deja de coincidir")
        void tamperedPayloadIsRejected() {
            JwtService service = jwt(SECRET, 60_000L);
            String[] parts = service.generateToken(USER, "sid").split("\\.");
            String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding()
                    .encodeToString("{\"sub\":\"admin@radar.com\",\"sid\":\"sid\"}".getBytes());
            String forged = parts[0] + "." + forgedPayload + "." + parts[2];

            assertThrows(SignatureException.class, () -> service.extractUsername(forged));
        }

        @Test
        @DisplayName("CB-JWT-04 newSessionId genera UUID unicos con formato valido")
        void sessionIdsAreUuids() {
            JwtService service = jwt(SECRET, 60_000L);
            String a = service.newSessionId();
            String b = service.newSessionId();

            assertDoesNotThrow(() -> UUID.fromString(a));
            assertNotEquals(a, b);
        }

        @Test
        @DisplayName("CB-JWT-06 (OBS-01) un caracter extra al final de la firma se ignora; dos o mas se rechazan")
        void trailingCharacterInSignatureIsIgnoredByDecoder() {
            // Documenta un comportamiento observado: con HS384 la firma ocupa 64 caracteres Base64URL exactos y
            // el decodificador descarta un caracter final incompleto. No permite falsificar tokens.
            JwtService service = jwt(SECRET, 60_000L);
            String token = service.generateToken(USER, "sid");

            assertEquals("cb@radar.test", service.extractUsername(token + "x"));
            assertThrows(SignatureException.class, () -> service.extractUsername(token + "xx"));
        }

        @Test
        @DisplayName("CB-JWT-05 token sin claim sid: isTokenValid devuelve false (condicion tokenSessionId != null)")
        void tokenWithoutSessionIdIsInvalid() {
            JwtService service = jwt(SECRET, 60_000L);
            String token = service.generateToken(USER, null);

            assertNull(service.extractSessionId(token));
            assertFalse(service.isTokenValid(token, USER, null));
        }
    }

    @Nested
    @DisplayName("JwtAuthenticationFilter")
    class FilterCases {

        JwtService jwtService;
        UserDetailsServiceImpl userDetailsService;
        JwtAuthenticationFilter filter;
        FilterChain chain;

        @BeforeEach
        void setUp() {
            SecurityContextHolder.clearContext();
            jwtService = jwt(SECRET, 60_000L);
            userDetailsService = mock(UserDetailsServiceImpl.class);
            filter = new JwtAuthenticationFilter(jwtService, userDetailsService);
            chain = mock(FilterChain.class);
        }

        @AfterEach
        void tearDown() {
            SecurityContextHolder.clearContext();
        }

        private MockHttpServletRequest request(String authorization) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/reportes");
            if (authorization != null) {
                request.addHeader("Authorization", authorization);
            }
            return request;
        }

        @ParameterizedTest(name = "CB-FIL-01 cabecera ''{0}'' -> continua sin autenticar")
        @CsvSource(value = {"NULL", "Basic dXNlcjpwYXNz", "bearer minusculas"}, nullValues = "NULL")
        void requestsWithoutBearerAreNotAuthenticated(String header) throws Exception {
            filter.doFilter(request(header), new MockHttpServletResponse(), chain);

            assertNull(SecurityContextHolder.getContext().getAuthentication());
            verify(chain).doFilter(any(), any());
            verifyNoInteractions(userDetailsService);
        }

        @Test
        @DisplayName("CB-FIL-02 token valido y sesion activa -> contexto autenticado con sus roles")
        void validTokenAndActiveSessionAuthenticates() throws Exception {
            String token = jwtService.generateToken(USER, "sid");
            when(userDetailsService.loadUserByUsername("cb@radar.test")).thenReturn(USER);
            when(userDetailsService.isActiveSession("cb@radar.test", "sid")).thenReturn(true);

            filter.doFilter(request("Bearer " + token), new MockHttpServletResponse(), chain);

            var auth = SecurityContextHolder.getContext().getAuthentication();
            assertNotNull(auth);
            assertEquals("cb@radar.test", ((UserDetails) auth.getPrincipal()).getUsername());
            assertTrue(auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_USER")));
        }

        @Test
        @DisplayName("CB-FIL-03 token valido pero sesion reemplazada (otro dispositivo) -> no autentica")
        void validTokenButReplacedSessionDoesNotAuthenticate() throws Exception {
            String token = jwtService.generateToken(USER, "old-sid");
            when(userDetailsService.loadUserByUsername("cb@radar.test")).thenReturn(USER);
            when(userDetailsService.isActiveSession("cb@radar.test", "old-sid")).thenReturn(false);

            filter.doFilter(request("Bearer " + token), new MockHttpServletResponse(), chain);

            assertNull(SecurityContextHolder.getContext().getAuthentication());
            verify(chain).doFilter(any(), any());
        }

        @Test
        @DisplayName("CB-FIL-04 token malformado -> excepcion capturada, contexto limpio y la cadena continua")
        void malformedTokenIsSwallowed() throws Exception {
            filter.doFilter(request("Bearer esto.no.es-un-jwt"), new MockHttpServletResponse(), chain);

            assertNull(SecurityContextHolder.getContext().getAuthentication());
            verify(chain).doFilter(any(), any());
        }

        @Test
        @DisplayName("CB-FIL-05 contexto ya autenticado -> no se vuelve a consultar la base de datos")
        void alreadyAuthenticatedContextIsKept() throws Exception {
            var existing = new UsernamePasswordAuthenticationToken("ya", null, List.of());
            SecurityContextHolder.getContext().setAuthentication(existing);
            String token = jwtService.generateToken(USER, "sid");

            filter.doFilter(request("Bearer " + token), new MockHttpServletResponse(), chain);

            assertSame(existing, SecurityContextHolder.getContext().getAuthentication());
            verifyNoInteractions(userDetailsService);
        }
    }

    @Nested
    @DisplayName("RecaptchaService y GoogleTokenService")
    class ExternalVerificationCases {

        @Test
        @DisplayName("CB-CAP-01 reCAPTCHA deshabilitado -> retorna sin validar (incluso con token nulo)")
        void disabledCaptchaSkipsVerification() {
            assertDoesNotThrow(() -> new RecaptchaService(false, "").verify(null));
        }

        @ParameterizedTest(name = "CB-CAP-02 habilitado con token=''{0}'' y secreto=''{1}'' -> CAPTCHA requerida")
        @CsvSource(value = {"NULL,secreto", "'   ',secreto", "token-valido,''"}, nullValues = "NULL")
        void enabledCaptchaRejectsMissingInputs(String token, String secret) {
            var ex = assertThrows(IllegalArgumentException.class, () -> new RecaptchaService(true, secret).verify(token));
            assertEquals("Verificación CAPTCHA requerida", ex.getMessage());
        }

        @ParameterizedTest(name = "CB-GOO-01 client-id ''{0}'' -> IllegalStateException (login Google no configurado)")
        @CsvSource(value = {"NULL", "''", "'   '"}, nullValues = "NULL")
        void googleWithoutClientIdIsNotConfigured(String clientId) {
            assertThrows(IllegalStateException.class, () -> new GoogleTokenService(clientId).verify("cualquier"));
        }
    }

    @Nested
    @DisplayName("AuditLogService")
    class AuditCases {

        @Test
        @DisplayName("CB-AUD-01 valores nulos se sustituyen por 'Sistema', 'ADMIN' y '-'")
        void nullFieldsGetDefaults() {
            AuditLogRepository repository = mock(AuditLogRepository.class);
            when(repository.save(any(AuditLog.class))).thenAnswer(inv -> inv.getArgument(0));

            AuditLog saved = new AuditLogService(repository)
                    .registrarEvento("REPORTES", "CREACION", null, null, null, null, null, "detalle");

            assertEquals("Sistema", saved.getUsuario());
            assertEquals("ADMIN", saved.getRol());
            assertEquals("-", saved.getEntidad());
        }

        @Test
        @DisplayName("CB-AUD-02 valores presentes se conservan sin alteracion")
        void presentFieldsAreKept() {
            AuditLogRepository repository = mock(AuditLogRepository.class);
            when(repository.save(any(AuditLog.class))).thenAnswer(inv -> inv.getArgument(0));

            AuditLog saved = new AuditLogService(repository)
                    .registrarEvento("M", "A", "ana", "USER", "Reporte #1", "a", "b", "d");

            assertEquals("ana", saved.getUsuario());
            assertEquals("USER", saved.getRol());
            assertEquals("Reporte #1", saved.getEntidad());
        }
    }
}
