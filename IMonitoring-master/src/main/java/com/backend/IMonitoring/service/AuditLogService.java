package com.backend.IMonitoring.service;

import com.backend.IMonitoring.model.AuditLog;
import com.backend.IMonitoring.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public void logAction(String action, String performedBy, String details) {
        AuditLog log = AuditLog.builder()
                .timestamp(LocalDateTime.now(ZoneOffset.UTC))
                .action(action)
                .performedBy(performedBy != null ? performedBy : "Sistema")
                .details(details)
                .build();

        auditLogRepository.save(log);
    }

    public List<AuditLog> getAllLogs() {
        return auditLogRepository.findAllByOrderByTimestampDesc();
    }
}