package com.radar.api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "backup_schedule")
@Getter
@Setter
@NoArgsConstructor
public class BackupSchedule {

    @Id
    private Integer id = 1;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "interval_hours", nullable = false)
    private int intervalHours = 24;

    @Column(name = "next_backup_at")
    private Instant nextBackupAt;

    @Column(name = "last_backup_at")
    private Instant lastBackupAt;

    @Column(name = "last_error", length = 500)
    private String lastError;
}
