package com.backend.IMonitoring.dto;

import com.backend.IMonitoring.model.ReservationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReservationResponseDTO {
    private String id;
    private String groupId;
    private String recurrenceDetails;
    private ClassroomSummaryDTO classroom;
    private UserSummaryDTO user;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private String purpose;
    private ReservationStatus status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // --- NUEVOS CAMPOS PARA EDICIÓN DE SEMESTRE ---
    private LocalDate semesterStartDate;
    private LocalDate semesterEndDate;
    private List<String> daysOfWeek;
}