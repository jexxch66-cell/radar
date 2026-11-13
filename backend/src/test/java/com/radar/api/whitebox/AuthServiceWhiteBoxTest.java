package com.radar.api.whitebox;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.exception.ConcurrentSessionException;
import com.radar.api.exception.InvalidCredentialsException;
import com.radar.api.model.Administrador;
import com.radar.api.model.Role;
import com.radar.api.model.User;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import com.radar.api.service.AuthService;
import com.radar.api.service.GoogleTokenService;
import com.radar.api.service.JwtService;
import com.radar.api.service.RecaptchaService;
import com.radar.api.service.UserDetailsServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.lang.reflect.Field;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Pruebas de CAJA BLANCA de AuthService (estructura del commit e9e1021).
 * Los casos se derivan de las decisiones del codigo: politica de contrasenas (expresion regular), registro
 * ESTATICO de sesiones en memoria (ACTIVE_SESSIONS), candado entre navegadores (handleSessionLockAction con sus
 * ramas claim / heartbeat / release / check y la expiracion de 30 s), hasActiveSession (memoria O base de datos),
 * requireSessionUpdated y las ramas de login, registro y Google.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceWhiteBoxTest {

    private static final String EMAIL = "cb@radar.test";
    private static final String PASSWORD = "Segura123";

    @Mock UserRepository userRepository;
    @Mock AdministradorRepository administradorRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;
    @Mock UserDetailsServiceImpl userDetailsService;
    @Mock GoogleTokenService googleTokenService;
    @Mock RecaptchaService recaptchaService;
    @InjectMocks AuthService service;

    private final UserDetails details = org.springframework.security.core.userdetails.User
            .withUsername(EMAIL).password("x").roles("USER").build();

    /** Mapa estatico de sesiones AUTENTICADAS (sessionId del JWT). */
    static Map<String, AuthService.ActiveSessionRecord> sessions() {
        return staticMap("ACTIVE_SESSIONS");
    }

    /** Mapa estatico del candado de pestanas del frontend (tabId), separado de las sesiones (correccion DEF-13). */
    static Map<String, AuthService.ActiveSessionRecord> locks() {
        return staticMap("BROWSER_LOCKS");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, AuthService.ActiveSessionRecord> staticMap(String name) {
        try {
            Field f = AuthService.class.getDeclaredField(name);
            f.setAccessible(true);
            return (Map<String, AuthService.ActiveSessionRecord>) f.get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    @BeforeEach
    @AfterEach
    void clearSessions() {
        sessions().clear();
        locks().clear();
    }

    private LoginRequest login(boolean force) {
        LoginRequest request = new LoginRequest();
        request.setEmail(EMAIL);
        request.setPassword(PASSWORD);
        request.setForce(force);
        return request;
    }

    private void stubSuccessfulUserLogin(User user, String sid) {
        when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        when(jwtService.newSessionId()).thenReturn(sid);
        when(userRepository.updateActiveSessionId(eq(EMAIL), eq(sid), any(Instant.class))).thenReturn(1);
        when(userDetailsService.loadUserByUsername(EMAIL)).thenReturn(details);
        when(jwtService.generateToken(details, sid)).thenReturn("tok-" + sid);
    }

    // ------------------------------------------------------------------ Politica de contrasenas

    @Nested
    @DisplayName("validatePasswordPolicy")
    class PasswordPolicy {

        @ParameterizedTest(name = "CB-POL-01 contrasena invalida ''{0}'' -> IllegalArgumentException")
        @NullAndEmptySource
        @ValueSource(strings = {"Abcd123", "abcd1234", "ABCDEFGH", "abcdefgh"})
        void rejectsPasswordsOutsidePolicy(String password) {
            assertThrows(IllegalArgumentException.class, () -> AuthService.validatePasswordPolicy(password));
        }

        @ParameterizedTest(name = "CB-POL-02 contrasena valida ''{0}'' (limite de 8 caracteres incluido)")
        @ValueSource(strings = {"Abcd1234", "ABCD1234", "Segura123!"})
        void acceptsPasswordsInsidePolicy(String password) {
            assertDoesNotThrow(() -> AuthService.validatePasswordPolicy(password));
        }
    }

    // ------------------------------------------------------------------ Registro en memoria y candado

    @Nested
    @DisplayName("isMemorySessionMatching y handleSessionLockAction")
    class SessionLock {

        @Test
        @DisplayName("CB-MEM-01 isMemorySessionMatching: nulos -> false; mismo sid (sin importar mayusculas del correo) -> true; otro sid -> false")
        void memoryMatching() {
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("sid", Instant.now()));

            assertFalse(AuthService.isMemorySessionMatching(null, "sid"));
            assertFalse(AuthService.isMemorySessionMatching(EMAIL, null));
            assertTrue(AuthService.isMemorySessionMatching(EMAIL.toUpperCase(), "sid"));
            assertFalse(AuthService.isMemorySessionMatching(EMAIL, "otro"));
        }

        @Test
        @DisplayName("CB-LCK-01 correo en blanco -> permitido sin modificar el registro")
        void blankEmailIsAllowed() {
            assertTrue(service.handleSessionLockAction("claim", "  ", "tab"));
            assertTrue(locks().isEmpty());
        }

        @Test
        @DisplayName("CB-LCK-02 claim libre -> true y registra la pestana; claim de la misma pestana -> true; de otra -> false")
        void claimBranches() {
            assertTrue(service.handleSessionLockAction("claim", EMAIL, "tabA"));
            assertEquals("tabA", locks().get(EMAIL).sessionId());
            assertTrue(service.handleSessionLockAction("claim", EMAIL, "tabA"));
            assertFalse(service.handleSessionLockAction("claim", EMAIL, "tabB"));
        }

        @Test
        @DisplayName("CB-LCK-03 check (accion por defecto): libre -> true; misma pestana -> true; otra pestana -> false")
        void checkBranches() {
            assertTrue(service.handleSessionLockAction(null, EMAIL, "tabA"));
            service.handleSessionLockAction("claim", EMAIL, "tabA");
            assertTrue(service.handleSessionLockAction("check", EMAIL, "tabA"));
            assertFalse(service.handleSessionLockAction("check", EMAIL, "tabB"));
        }

        @Test
        @DisplayName("CB-LCK-04 heartbeat: renueva solo a la pestana duena; crea registro si no existe; no altera el de otra pestana")
        void heartbeatBranches() {
            Instant old = Instant.now().minusSeconds(10);
            locks().put(EMAIL, new AuthService.ActiveSessionRecord("tabA", old));

            service.handleSessionLockAction("heartbeat", EMAIL, "tabB");
            assertEquals(old, locks().get(EMAIL).lastActiveAt());

            service.handleSessionLockAction("heartbeat", EMAIL, "tabA");
            assertTrue(locks().get(EMAIL).lastActiveAt().isAfter(old));

            locks().clear();
            service.handleSessionLockAction("heartbeat", EMAIL, "tabC");
            assertEquals("tabC", locks().get(EMAIL).sessionId());
        }

        @ParameterizedTest(name = "CB-LCK-05 release por ''{0}'' -> registro eliminado={1}")
        @CsvSource(value = {"tabA, true", "tabB, false", "'', true"})
        void releaseBranches(String tab, boolean removed) {
            service.handleSessionLockAction("claim", EMAIL, "tabA");
            service.handleSessionLockAction("release", EMAIL, tab);
            assertEquals(removed, !locks().containsKey(EMAIL));
        }

        @Test
        @DisplayName("CB-LCK-06 un registro con mas de 30 s sin actividad se descarta y otra pestana puede reclamar")
        void expiredRecordIsDiscarded() {
            locks().put(EMAIL, new AuthService.ActiveSessionRecord("tabA",
                    Instant.now().minus(AuthService.SESSION_INACTIVITY_TIMEOUT).minusSeconds(1)));

            assertTrue(service.handleSessionLockAction("claim", EMAIL, "tabB"));
            assertEquals("tabB", locks().get(EMAIL).sessionId());
        }

        @Test
        @DisplayName("CB-LCK-07 (DEF-13) tras un login, la pestana puede reclamar el candado: sessionId y tabId ya no comparten mapa")
        void claimAfterLoginSucceeds() {
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("sid-del-login", Instant.now()));

            assertTrue(service.handleSessionLockAction("claim", EMAIL, "tab-de-la-pestana"));
            assertEquals("sid-del-login", sessions().get(EMAIL).sessionId());
        }

        @Test
        @DisplayName("CB-LCK-08 (DEF-11) un candado de pestana reclamado NO bloquea el login en el backend")
        void browserLockDoesNotBlockLogin() {
            service.handleSessionLockAction("claim", EMAIL, "tab-de-un-tercero");
            stubSuccessfulUserLogin(User.builder().id(1L).nombre("U").email(EMAIL).role(Role.USER).build(), "sid");

            assertEquals("tok-sid", service.login(login(false)).getToken());
        }
    }

    // ------------------------------------------------------------------ Login

    @Nested
    @DisplayName("login")
    class Login {

        @Test
        @DisplayName("CB-AUTH-01 contrasena fuera de politica -> IllegalArgumentException ANTES de autenticar")
        void policyIsCheckedFirst() {
            LoginRequest request = login(false);
            request.setPassword("corta");

            assertThrows(IllegalArgumentException.class, () -> service.login(request));
            verifyNoInteractions(authenticationManager);
        }

        @Test
        @DisplayName("CB-AUTH-02 credenciales rechazadas -> InvalidCredentialsException")
        void badCredentials() {
            doThrow(new BadCredentialsException("x")).when(authenticationManager).authenticate(any());
            assertThrows(InvalidCredentialsException.class, () -> service.login(login(false)));
        }

        @Test
        @DisplayName("CB-AUTH-03 sin sesion previa -> token y registro en memoria con el mismo sid")
        void successfulLoginRegistersMemorySession() {
            stubSuccessfulUserLogin(User.builder().id(1L).nombre("U").email(EMAIL).role(Role.USER).build(), "sid1");

            assertEquals("tok-sid1", service.login(login(false)).getToken());
            assertEquals("sid1", sessions().get(EMAIL).sessionId());
        }

        @ParameterizedTest(name = "CB-AUTH-04 sesion en BD con heartbeat hace {0} s -> bloqueo={1}")
        @CsvSource({"5, true", "29, true", "31, false"})
        void databaseSessionWindow(long secondsAgo, boolean blocked) {
            User user = User.builder().id(1L).nombre("U").email(EMAIL).role(Role.USER)
                    .activeSessionId("db-sid").lastActiveAt(Instant.now().minus(Duration.ofSeconds(secondsAgo))).build();
            if (blocked) {
                when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
                when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));
                assertThrows(ConcurrentSessionException.class, () -> service.login(login(false)));
            } else {
                stubSuccessfulUserLogin(user, "nuevo");
                assertEquals("tok-nuevo", service.login(login(false)).getToken());
            }
        }

        @Test
        @DisplayName("CB-AUTH-05 sesion activa SOLO en memoria (BD sin sesion) -> 409 (rama memRecord de hasActiveSession)")
        void memorySessionAloneBlocks() {
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("mem", Instant.now()));
            when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(1L).email(EMAIL).role(Role.USER).build()));

            assertThrows(ConcurrentSessionException.class, () -> service.login(login(false)));
        }

        @Test
        @DisplayName("CB-AUTH-06 el flag force ya no desplaza una sesion activa (bloqueo estricto)")
        void forceIsIgnored() {
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("mem", Instant.now()));
            when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(1L).email(EMAIL).role(Role.USER).build()));

            assertThrows(ConcurrentSessionException.class, () -> service.login(login(true)));
        }

        @Test
        @DisplayName("CB-AUTH-07 rama administrador: exito -> rol ADMIN y sesion registrada en memoria")
        void adminBranch() {
            Administrador admin = Administrador.builder().id(2L).nombre("A").email(EMAIL).build();
            when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.of(admin));
            when(jwtService.newSessionId()).thenReturn("adm");
            when(administradorRepository.updateActiveSessionId(eq(EMAIL), eq("adm"), any(Instant.class))).thenReturn(1);
            when(userDetailsService.loadUserByUsername(EMAIL)).thenReturn(details);
            when(jwtService.generateToken(details, "adm")).thenReturn("admin-tok");

            var response = service.login(login(false));

            assertEquals("ADMIN", response.getRole());
            assertEquals("adm", sessions().get(EMAIL).sessionId());
            verifyNoInteractions(userRepository);
        }

        @Test
        @DisplayName("CB-AUTH-08 autenticado pero ausente en ambas tablas -> InvalidCredentialsException")
        void missingAccount() {
            when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            assertThrows(InvalidCredentialsException.class, () -> service.login(login(false)));
        }

        @Test
        @DisplayName("CB-AUTH-09 requireSessionUpdated con 0 filas -> IllegalStateException y sin token")
        void sessionUpdateMustAffectOneRow() {
            when(administradorRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(User.builder().id(1L).email(EMAIL).role(Role.USER).build()));
            when(jwtService.newSessionId()).thenReturn("x");
            when(userRepository.updateActiveSessionId(eq(EMAIL), eq("x"), any(Instant.class))).thenReturn(0);

            assertThrows(IllegalStateException.class, () -> service.login(login(false)));
            verify(jwtService, never()).generateToken(any(), any());
        }
    }

    // ------------------------------------------------------------------ Registro

    @Nested
    @DisplayName("register")
    class Register {

        private RegisterRequest request(String email, String password) {
            RegisterRequest r = new RegisterRequest();
            r.setNombre("Ana");
            r.setEmail(email);
            r.setPassword(password);
            return r;
        }

        @Test
        @DisplayName("CB-REG-01 contrasena fuera de politica -> excepcion antes de verificar reCAPTCHA")
        void policyBeforeCaptcha() {
            assertThrows(IllegalArgumentException.class, () -> service.register(request(EMAIL, "debil")));
            verifyNoInteractions(recaptchaService, userRepository);
        }

        @Test
        @DisplayName("CB-REG-02 reCAPTCHA invalido -> excepcion y no se consulta la base de datos")
        void captchaFailureStops() {
            doThrow(new IllegalArgumentException("captcha")).when(recaptchaService).verify(any());
            assertThrows(IllegalArgumentException.class, () -> service.register(request(EMAIL, PASSWORD)));
            verifyNoInteractions(userRepository);
        }

        @Test
        @DisplayName("CB-REG-03 el registro no abre una sesion 'en uso' pero el token devuelto corresponde a la sesion guardada")
        void registeredSessionMatchesReturnedToken() {
            when(jwtService.newSessionId()).thenReturn("reg");
            when(passwordEncoder.encode(PASSWORD)).thenReturn("enc");
            when(userDetailsService.loadUserByUsername(EMAIL)).thenReturn(details);
            when(jwtService.generateToken(details, "reg")).thenReturn("tok");

            service.register(request(EMAIL, PASSWORD));

            verify(userRepository).save(argThat(u -> "reg".equals(u.getActiveSessionId()) && u.getLastActiveAt() == null));
            assertFalse(sessions().containsKey(EMAIL), "el registro no debe ocupar el candado en memoria");
        }

        @Test
        @DisplayName("CB-REG-04 (DEF-01) correo de un administrador en otra capitalizacion -> 409 y no se guarda")
        void rejectsAdministratorEmail() {
            when(administradorRepository.existsByEmailIgnoreCase("admin@radar.test")).thenReturn(true);

            assertThrows(com.radar.api.exception.EmailAlreadyExistsException.class,
                    () -> service.register(request("Admin@Radar.TEST", PASSWORD)));
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("CB-REG-05 (DEF-02) el correo se normaliza y la unicidad se verifica sin distinguir mayusculas")
        void normalisesEmail() {
            when(jwtService.newSessionId()).thenReturn("reg");
            when(passwordEncoder.encode(PASSWORD)).thenReturn("enc");
            when(userDetailsService.loadUserByUsername("ana.mixta@radar.test")).thenReturn(details);
            when(jwtService.generateToken(details, "reg")).thenReturn("tok");

            var response = service.register(request("  Ana.Mixta@Radar.TEST ", PASSWORD));

            assertEquals("ana.mixta@radar.test", response.getEmail());
            verify(userRepository).existsByEmailIgnoreCase("ana.mixta@radar.test");
            verify(administradorRepository).existsByEmailIgnoreCase("ana.mixta@radar.test");
        }
    }

    // ------------------------------------------------------------------ Google, heartbeat y logout

    @Nested
    @DisplayName("loginWithGoogle, heartbeat y logout")
    class GoogleHeartbeatLogout {

        @Test
        @DisplayName("CB-GGL-01 cuenta nueva sin consentimiento -> IllegalArgumentException y no se guarda")
        void googleRequiresConsent() {
            when(googleTokenService.verify("id")).thenReturn(new GoogleTokenService.GoogleProfile("sub", EMAIL, "G"));
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

            assertThrows(IllegalArgumentException.class, () -> service.loginWithGoogle("id", false, null));
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("CB-GGL-02 cuenta existente con sesion activa -> 409")
        void googleBlockedByActiveSession() {
            User user = User.builder().id(3L).nombre("G").email(EMAIL).role(Role.USER)
                    .activeSessionId("sid").lastActiveAt(Instant.now()).build();
            when(googleTokenService.verify("id")).thenReturn(new GoogleTokenService.GoogleProfile("sub", EMAIL, "G"));
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user));

            assertThrows(ConcurrentSessionException.class, () -> service.loginWithGoogle("id", true, null));
        }

        @Test
        @DisplayName("CB-GGL-03 (DEF-01) una cuenta Google nueva no puede usar el correo de un administrador")
        void googleCannotUseAdministratorEmail() {
            when(googleTokenService.verify("id")).thenReturn(new GoogleTokenService.GoogleProfile("sub", EMAIL, "G"));
            when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
            when(administradorRepository.existsByEmailIgnoreCase(EMAIL)).thenReturn(true);

            assertThrows(com.radar.api.exception.EmailAlreadyExistsException.class, () -> service.loginWithGoogle("id", true, null));
            verify(userRepository, never()).save(any());
        }

        @Test
        @DisplayName("CB-HB-01 heartbeat renueva la memoria solo si el sid coincide; errores del repositorio se ignoran")
        void heartbeatBranches() {
            Instant old = Instant.now().minusSeconds(10);
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("sid", old));
            doThrow(new RuntimeException("bd caida")).when(userRepository).updateLastActiveAt(any(), any(), any());

            service.heartbeat(EMAIL, "otro");
            assertEquals(old, sessions().get(EMAIL).lastActiveAt());

            assertDoesNotThrow(() -> service.heartbeat(EMAIL, "sid"));
            assertTrue(sessions().get(EMAIL).lastActiveAt().isAfter(old));
        }

        @Test
        @DisplayName("CB-OUT-01 logout elimina el registro en memoria y tolera errores del repositorio")
        void logoutBranches() {
            sessions().put(EMAIL, new AuthService.ActiveSessionRecord("sid", Instant.now()));
            doThrow(new RuntimeException("bd caida")).when(userRepository).clearActiveSession(any());

            assertDoesNotThrow(() -> service.logout(EMAIL.toUpperCase()));
            assertFalse(sessions().containsKey(EMAIL));
        }

        @Test
        @DisplayName("CB-OUT-02 logout libera tambien el candado de pestanas de la cuenta")
        void logoutReleasesBrowserLock() {
            service.handleSessionLockAction("claim", EMAIL, "tab");
            service.logout(EMAIL);
            assertFalse(locks().containsKey(EMAIL));
        }
    }
}
