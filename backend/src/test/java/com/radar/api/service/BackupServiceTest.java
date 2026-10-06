package com.radar.api.service;

import com.azure.storage.blob.BlobServiceClient;
import com.radar.api.dto.request.UpdateBackupScheduleRequest;
import com.radar.api.dto.response.BackupStatusResponse;
import com.radar.api.model.BackupSchedule;
import com.radar.api.repository.BackupScheduleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.Comparator;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class BackupServiceTest {

    @Mock
    private BackupScheduleRepository scheduleRepository;

    @Mock
    private ObjectProvider<BlobServiceClient> blobServiceClientProvider;

    @Mock
    private Environment environment;

    private BackupSchedule schedule;
    private BackupService backupService;
    private Path backupDirectory;

    @BeforeEach
    void setUp() throws IOException {
        schedule = new BackupSchedule();
        schedule.setId(1);
        schedule.setIntervalHours(24);
        schedule.setEnabled(false);
        backupDirectory = Files.createTempDirectory("radar-backup-test-");
        backupService = new BackupService(scheduleRepository, blobServiceClientProvider, environment);
        ReflectionTestUtils.setField(backupService, "localDirectory", backupDirectory.toString());
    }

    @Test
    void updateScheduleEnablesLocalBackupWithCustomInterval() {
        stubScheduleRepository();
        Instant beforeUpdate = Instant.now();

        BackupStatusResponse status = backupService.updateSchedule(new UpdateBackupScheduleRequest(true, 48));

        assertTrue(status.scheduleEnabled());
        assertEquals(48, status.intervalHours());
        assertNotNull(status.nextBackupAt());
        assertTrue(status.nextBackupAt().isAfter(beforeUpdate.plusSeconds(47 * 3600L)));
        assertNull(status.lastError());
        assertTrue(status.storageConfigured());
        assertEquals("LOCAL", status.storageType());
        verify(scheduleRepository).save(schedule);
    }

    @Test
    void updateScheduleDisablesNextExecution() {
        stubScheduleRepository();
        schedule.setEnabled(true);
        schedule.setNextBackupAt(Instant.now().plusSeconds(3600));

        BackupStatusResponse status = backupService.updateSchedule(new UpdateBackupScheduleRequest(false, 12));

        assertFalse(status.scheduleEnabled());
        assertEquals(12, status.intervalHours());
        assertNull(status.nextBackupAt());
        verify(scheduleRepository).save(schedule);
    }

    private void stubScheduleRepository() {
        when(scheduleRepository.findById(1)).thenReturn(Optional.of(schedule));
        when(scheduleRepository.save(any(BackupSchedule.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @org.junit.jupiter.api.AfterEach
    void cleanBackupDirectory() throws IOException {
        try (var paths = Files.walk(backupDirectory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    throw new IllegalStateException(exception);
                }
            });
        }
    }
}
