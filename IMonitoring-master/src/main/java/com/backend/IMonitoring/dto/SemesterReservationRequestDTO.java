package com.backend.IMonitoring.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Data
public class SemesterReservationRequestDTO {
    @NotNull
    private String classroomId;

    @NotNull
    private String professorId;

    private String purpose;

    @NotNull
    private LocalDate semesterStartDate;

    @NotNull
    private LocalDate semesterEndDate;

    @NotNull
    private LocalTime startTime;

    @NotNull
    private LocalTime endTime;

    @NotNull
    private List<DayOfWeek> daysOfWeek;
}