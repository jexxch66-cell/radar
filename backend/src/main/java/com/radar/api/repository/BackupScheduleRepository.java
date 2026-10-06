package com.radar.api.repository;

import com.radar.api.model.BackupSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BackupScheduleRepository extends JpaRepository<BackupSchedule, Integer> {
}
