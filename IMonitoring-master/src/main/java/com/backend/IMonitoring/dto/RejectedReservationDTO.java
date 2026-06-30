package com.backend.IMonitoring.dto;

import lombok.*;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RejectedReservationDTO {
    private String userName;
    private String classroomName;
    private String status;
    private String reason;
    private LocalDateTime date;
}