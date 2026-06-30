package com.backend.IMonitoring.dto;

import lombok.*;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CancellationReportDTO {
    private long totalCancellations;
    private long totalRejected;
    private Map<String, Long> reasonsCount;
    private List<RejectedReservationDTO> details;
}