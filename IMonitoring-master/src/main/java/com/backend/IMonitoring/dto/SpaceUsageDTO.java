package com.backend.IMonitoring.dto;

import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SpaceUsageDTO {
    private String classroomName;
    private long totalReservations;
    private double usagePercentage;
}