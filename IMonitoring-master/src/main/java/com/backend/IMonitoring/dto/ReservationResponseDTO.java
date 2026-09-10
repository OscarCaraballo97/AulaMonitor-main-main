package com.backend.IMonitoring.dto;

import com.backend.IMonitoring.model.ReservationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import com.backend.IMonitoring.model.Classroom;

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
    private LocalDate semesterStartDate;
    private LocalDate semesterEndDate;
    private List<String> daysOfWeek;
    private String institution;
    private boolean success;
    private String message;
    private List<Classroom> suggestions;
}