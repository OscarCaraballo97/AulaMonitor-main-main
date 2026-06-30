package com.backend.IMonitoring.dto;

import lombok.*;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserReportDTO {
    private long totalUsers;
    private Map<String, Long> usersByRole;
    private Map<String, Long> usersByInstitution;
    private Map<String, Long> usersByCareer;
}