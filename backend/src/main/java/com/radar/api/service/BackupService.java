package com.radar.api.service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.models.BlobItem;
import com.azure.storage.blob.models.BlobProperties;
import com.azure.storage.blob.models.BlobStorageException;
import com.radar.api.dto.request.UpdateBackupScheduleRequest;
import com.radar.api.dto.response.BackupInfoResponse;
import com.radar.api.dto.response.BackupStatusResponse;
import com.radar.api.model.BackupSchedule;
import com.radar.api.repository.BackupScheduleRepository;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

@Service
@Slf4j
public class BackupService {

    private static final int SCHEDULE_ID = 1;
    private static final String BACKUP_PREFIX = "radar-db-";
    private static final String PRE_RESTORE_BACKUP_PREFIX = "radar-pre-restore-";
    private static final DateTimeFormatter BACKUP_NAME_TIME =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS").withZone(ZoneOffset.UTC);
    private static final long COMMAND_TIMEOUT_MINUTES = 30;

    private final BackupScheduleRepository scheduleRepository;
    private final ObjectProvider<BlobServiceClient> blobServiceClientProvider;
    private final Environment environment;
    private final ReentrantLock operationLock = new ReentrantLock();

    @Value("${app.backup.azure-container:radar-backups}")
    private String containerName;

    @Value("${app.backup.local-directory:}")
    private String localDirectory;

    @Value("${app.backup.docker-container:}")
    private String dockerContainer;

    @Value("${app.backup.docker-path:docker}")
    private String dockerPath;

    @Value("${app.backup.pg-dump-path:pg_dump}")
    private String pgDumpPath;

    @Value("${app.backup.pg-restore-path:pg_restore}")
    private String pgRestorePath;

    public BackupService(
            BackupScheduleRepository scheduleRepository,
            ObjectProvider<BlobServiceClient> blobServiceClientProvider,
            Environment environment) {
        this.scheduleRepository = scheduleRepository;
        this.blobServiceClientProvider = blobServiceClientProvider;
        this.environment = environment;
    }

    @PostConstruct
    public void initializeSchedule() {
        scheduleRepository.findById(SCHEDULE_ID).orElseGet(() -> {
            BackupSchedule schedule = new BackupSchedule();
            schedule.setId(SCHEDULE_ID);
            schedule.setIntervalHours(24);
            schedule.setEnabled(false);
            return scheduleRepository.save(schedule);
        });
    }

    @Scheduled(fixedDelayString = "${app.backup.poll-interval-ms:60000}")
    public void runDueBackup() {
        Optional<BackupSchedule> optionalSchedule = scheduleRepository.findById(SCHEDULE_ID);
        if (optionalSchedule.isEmpty()) {
            return;
        }

        BackupSchedule schedule = optionalSchedule.get();
        if (!schedule.isEnabled() || schedule.getNextBackupAt() == null
                || schedule.getNextBackupAt().isAfter(Instant.now())) {
            return;
        }

        if (!operationLock.tryLock()) {
            return;
        }
        try {
            BackupInfoResponse result = createBackupUnlocked();
            updateAfterSuccessfulBackup(result.createdAt());
            log.info("Scheduled backup completed: {}", result.name());
        } catch (RuntimeException exception) {
            updateAfterFailedBackup(exception);
            log.error("Scheduled backup failed", exception);
        } finally {
            operationLock.unlock();
        }
    }

    public BackupStatusResponse getStatus() {
        BackupSchedule schedule = getSchedule();
        Optional<BackupInfoResponse> latest = findLatestBackup();
        return new BackupStatusResponse(
                true,
                isAzureConfigured() ? "AZURE" : "LOCAL",
                schedule.isEnabled(),
                schedule.getIntervalHours(),
                schedule.getNextBackupAt(),
                schedule.getLastBackupAt(),
                schedule.getLastError(),
                latest.map(BackupInfoResponse::name).orElse(null),
                latest.map(BackupInfoResponse::createdAt).orElse(null));
    }

    public BackupStatusResponse updateSchedule(UpdateBackupScheduleRequest request) {
        BackupSchedule schedule = getSchedule();
        schedule.setEnabled(request.enabled());
        schedule.setIntervalHours(request.intervalHours());
        schedule.setNextBackupAt(request.enabled()
                ? Instant.now().plusSeconds(request.intervalHours() * 3600L)
                : null);
        schedule.setLastError(null);
        scheduleRepository.save(schedule);
        return getStatus();
    }

    public BackupInfoResponse createBackup() {
        operationLock.lock();
        try {
            BackupInfoResponse backup = createBackupUnlocked();
            updateAfterSuccessfulBackup(backup.createdAt());
            return backup;
        } finally {
            operationLock.unlock();
        }
    }

    public BackupInfoResponse restoreLatestBackup() {
        operationLock.lock();
        Path downloadedDump = null;
        try {
            BackupArtifact latest = findLatestBackupArtifact()
                    .orElseThrow(() -> new IllegalStateException("No hay un backup disponible para restaurar."));

            createBackupUnlocked(PRE_RESTORE_BACKUP_PREFIX);

            downloadedDump = Files.createTempFile("radar-restore-", ".dump");
            if (latest.blobClient() != null) {
                latest.blobClient().downloadToFile(downloadedDump.toString(), true);
            } else {
                Files.copy(latest.localPath(), downloadedDump, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            runPostgresCommand(buildRestoreCommand(downloadedDump), pgRestorePath, downloadedDump);

            log.warn("Database restored from backup {}", latest.name());
            return new BackupInfoResponse(latest.name(), latest.createdAt(), latest.sizeBytes());
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo preparar el archivo para restaurarlo.", exception);
        } finally {
            deleteTemporaryFile(downloadedDump);
            operationLock.unlock();
        }
    }

    private BackupInfoResponse createBackupUnlocked() {
        return createBackupUnlocked(BACKUP_PREFIX);
    }

    private BackupInfoResponse createBackupUnlocked(String backupPrefix) {
        Path dump = null;
        try {
            dump = Files.createTempFile("radar-backup-", ".dump");
            runPostgresCommand(buildDumpCommand(dump), pgDumpPath, dump);

            String backupName = backupPrefix + BACKUP_NAME_TIME.format(Instant.now())
                    + "-" + UUID.randomUUID() + ".dump";
            Instant createdAt = Instant.now();
            long sizeBytes = Files.size(dump);
            if (isAzureConfigured()) {
                BlobContainerClient container = requireContainer();
                container.createIfNotExists();
                BlobClient blob = container.getBlobClient(backupName);
                blob.uploadFromFile(dump.toString(), true);
                BlobProperties properties = blob.getProperties();
                createdAt = properties.getLastModified().toInstant();
                sizeBytes = properties.getBlobSize();
                log.info("Database backup uploaded to Azure: {}", backupName);
            } else {
                Path destination = localBackupDirectory().resolve(backupName);
                Files.copy(dump, destination, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                log.info("Database backup saved locally: {}", destination);
            }
            return new BackupInfoResponse(backupName, createdAt, sizeBytes);
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo generar o subir el backup de la base de datos.", exception);
        } catch (BlobStorageException exception) {
            throw new IllegalStateException("Azure Blob Storage rechazó la operación de backup.", exception);
        } finally {
            deleteTemporaryFile(dump);
        }
    }

    private BlobContainerClient requireContainer() {
        BlobServiceClient client = blobServiceClientProvider.getIfAvailable();
        if (client == null) {
            throw new IllegalStateException(
                    "Azure Blob Storage no está configurado. Define AZURE_STORAGE_CONNECTION_STRING.");
        }
        return client.getBlobContainerClient(containerName);
    }

    private Optional<BackupInfoResponse> findLatestBackup() {
        return findLatestBackupArtifact().map(artifact -> new BackupInfoResponse(
                artifact.name(), artifact.createdAt(), artifact.sizeBytes()));
    }

    private Optional<BackupArtifact> findLatestBackupArtifact() {
        if (isAzureConfigured()) {
            return findLatestAzureBackup();
        }
        Path directory = localBackupDirectory();
        try (var files = Files.list(directory)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().startsWith(BACKUP_PREFIX))
                    .map(path -> localBackupArtifact(path))
                    .max(Comparator.comparing(BackupArtifact::createdAt));
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudieron consultar los backups locales.", exception);
        }
    }

    private Optional<BackupArtifact> findLatestAzureBackup() {
        return findLatestBlob(requireContainer()).map(item -> new BackupArtifact(
                item.getName(),
                item.getProperties().getLastModified().toInstant(),
                item.getProperties().getContentLength(),
                requireContainer().getBlobClient(item.getName()),
                null));
    }

    private Optional<BlobItem> findLatestBlob(BlobContainerClient container) {
        if (!container.exists()) {
            return Optional.empty();
        }
        return container.listBlobs().stream()
                .filter(item -> item.getName().startsWith(BACKUP_PREFIX))
                .max(Comparator.comparing(item -> item.getProperties().getLastModified()));
    }

    private BackupArtifact localBackupArtifact(Path path) {
        try {
            return new BackupArtifact(
                    path.getFileName().toString(),
                    Files.getLastModifiedTime(path).toInstant(),
                    Files.size(path),
                    null,
                    path);
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo leer la metadata del backup local.", exception);
        }
    }

    private boolean isAzureConfigured() {
        return blobServiceClientProvider.getIfAvailable() != null;
    }

    private Path localBackupDirectory() {
        Path directory = localDirectory == null || localDirectory.isBlank()
                ? Paths.get(System.getProperty("user.home"), ".radar", "backups")
                : Paths.get(localDirectory);
        try {
            Files.createDirectories(directory);
            return directory.toAbsolutePath().normalize();
        } catch (IOException exception) {
            throw new IllegalStateException("No se pudo crear el directorio local de backups: " + directory, exception);
        }
    }

    private BackupSchedule getSchedule() {
        return scheduleRepository.findById(SCHEDULE_ID)
                .orElseThrow(() -> new IllegalStateException("No se encontró la configuración de backups."));
    }

    private String[] buildDumpCommand(Path dump) {
        DatabaseConnection database = databaseConnection();
        String[] postgresArguments = new String[] {
                isDockerMode() ? "pg_dump" : pgDumpPath,
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--host=" + (isDockerMode() ? "localhost" : database.host()),
                "--port=" + (isDockerMode() ? "5432" : database.port()),
                "--username=" + database.username(),
                "--dbname=" + database.database()
        };
        if (isDockerMode()) {
            return dockerCommand(postgresArguments);
        }
        String[] command = java.util.Arrays.copyOf(postgresArguments, postgresArguments.length + 1);
        command[command.length - 1] = "--file=" + dump;
        return command;
    }

    private String[] buildRestoreCommand(Path dump) {
        DatabaseConnection database = databaseConnection();
        String[] postgresArguments = new String[] {
                isDockerMode() ? "pg_restore" : pgRestorePath,
                "--exit-on-error",
                "--single-transaction",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-acl",
                "--host=" + (isDockerMode() ? "localhost" : database.host()),
                "--port=" + (isDockerMode() ? "5432" : database.port()),
                "--username=" + database.username(),
                "--dbname=" + database.database()
        };
        if (isDockerMode()) {
            return dockerCommand(postgresArguments);
        }
        String[] command = java.util.Arrays.copyOf(postgresArguments, postgresArguments.length + 1);
        command[command.length - 1] = dump.toString();
        return command;
    }

    private String[] dockerCommand(String[] postgresArguments) {
        String[] command = new String[postgresArguments.length + 8];
        command[0] = dockerPath;
        command[1] = "exec";
        command[2] = "--interactive";
        command[3] = "--env";
        command[4] = "PGPASSWORD";
        command[5] = "--env";
        command[6] = "PGSSLMODE";
        command[7] = dockerContainer;
        System.arraycopy(postgresArguments, 0, command, 8, postgresArguments.length);
        return command;
    }

    private boolean isDockerMode() {
        return dockerContainer != null && !dockerContainer.isBlank();
    }

    private DatabaseConnection databaseConnection() {
        String jdbcUrl = environment.getProperty("spring.datasource.url");
        String username = environment.getProperty("spring.datasource.username");
        if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:postgresql://")
                || username == null || username.isBlank()) {
            throw new IllegalStateException("La conexión PostgreSQL no está configurada para backups.");
        }

        URI uri = URI.create(jdbcUrl.substring("jdbc:".length()));
        String path = uri.getPath();
        String database = path == null || path.length() < 2 ? "" : path.substring(1);
        if (database.isBlank() || database.contains("/")) {
            throw new IllegalStateException("No se pudo determinar la base de datos PostgreSQL para el backup.");
        }

        return new DatabaseConnection(
                uri.getHost(),
                uri.getPort() > 0 ? uri.getPort() : 5432,
                username,
                database,
                environment.getProperty("spring.datasource.password", ""),
                environment.getProperty("DB_SSLMODE", "prefer"));
    }

    private void runPostgresCommand(String[] command, String executable, Path dump) throws IOException {
        Path logFile = Files.createTempFile("radar-postgres-command-", ".log");
        try {
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            if (isDockerMode() && executable.equals(pgDumpPath)) {
                processBuilder.redirectOutput(dump.toFile());
                processBuilder.redirectError(logFile.toFile());
            } else if (isDockerMode() && executable.equals(pgRestorePath)) {
                processBuilder.redirectInput(dump.toFile());
                processBuilder.redirectError(logFile.toFile());
            } else {
                processBuilder.redirectErrorStream(true).redirectOutput(logFile.toFile());
            }
            DatabaseConnection database = databaseConnection();
            processBuilder.environment().put("PGPASSWORD", database.password());
            processBuilder.environment().put("PGSSLMODE", database.sslMode());
            Process process;
            try {
                process = processBuilder.start();
            } catch (IOException exception) {
                throw new IllegalStateException(
                        "No se pudo iniciar la herramienta de backup. Configura PostgreSQL client tools o BACKUP_DOCKER_CONTAINER.",
                        exception);
            }
            boolean completed;
            try {
                completed = process.waitFor(COMMAND_TIMEOUT_MINUTES, TimeUnit.MINUTES);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                process.destroyForcibly();
                throw new IllegalStateException("La operación de PostgreSQL fue interrumpida.", exception);
            }

            if (!completed) {
                process.destroyForcibly();
                throw new IllegalStateException("La operación de PostgreSQL superó el límite de 30 minutos.");
            }

            String output = Files.readString(logFile).trim();
            if (process.exitValue() != 0) {
                log.error("{} failed: {}", executable, output);
                throw new IllegalStateException(
                        output.isBlank()
                                ? "No se pudo ejecutar " + executable + ". Verifica que PostgreSQL client tools esté instalado."
                                : "Falló " + executable + ": " + output);
            }

            if (executable.equals(pgDumpPath) && Files.size(dump) == 0) {
                throw new IllegalStateException("pg_dump generó un archivo de backup vacío.");
            }
        } finally {
            deleteTemporaryFile(logFile);
        }
    }

    protected void updateAfterSuccessfulBackup(Instant createdAt) {
        BackupSchedule schedule = getSchedule();
        schedule.setLastBackupAt(createdAt);
        schedule.setLastError(null);
        schedule.setNextBackupAt(schedule.isEnabled()
                ? Instant.now().plusSeconds(schedule.getIntervalHours() * 3600L)
                : null);
        scheduleRepository.save(schedule);
    }

    protected void updateAfterFailedBackup(RuntimeException exception) {
        BackupSchedule schedule = getSchedule();
        schedule.setLastError(shortErrorMessage(exception));
        schedule.setNextBackupAt(schedule.isEnabled()
                ? Instant.now().plusSeconds(schedule.getIntervalHours() * 3600L)
                : null);
        scheduleRepository.save(schedule);
    }

    private String shortErrorMessage(RuntimeException exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return "Falló el backup automático. Revisa la configuración y los registros del servidor.";
        }
        return message.length() <= 500 ? message : message.substring(0, 500);
    }

    private void deleteTemporaryFile(Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            log.warn("Could not remove temporary backup file {}", path, exception);
        }
    }

    private record DatabaseConnection(
            String host,
            int port,
            String username,
            String database,
            String password,
            String sslMode) {
    }

    private record BackupArtifact(
            String name,
            Instant createdAt,
            long sizeBytes,
            BlobClient blobClient,
            Path localPath) {
    }
}
