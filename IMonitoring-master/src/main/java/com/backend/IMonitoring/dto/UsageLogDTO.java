package com.backend.IMonitoring.dto;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class UsageLogDTO {
    private String reservationId;
    private String classroomName;
    private String userName;
    private String role;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String purpose;
}