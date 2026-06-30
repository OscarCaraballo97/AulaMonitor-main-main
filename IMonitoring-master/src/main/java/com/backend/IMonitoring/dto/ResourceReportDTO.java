package com.backend.IMonitoring.dto;

import lombok.*;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResourceReportDTO {
    private String classroomName;
    private String buildingName;
    private Map<String, Integer> resources;
}