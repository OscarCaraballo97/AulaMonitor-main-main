package com.backend.IMonitoring.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SemesterReservationRequestDTO {

    @NotNull(message = "El ID del aula es obligatorio")
    private String classroomId;

    @NotNull(message = "El ID del profesor es obligatorio")
    private String professorId;

    @NotNull(message = "La fecha de inicio del semestre es obligatoria")
    private LocalDate semesterStartDate;

    @NotNull(message = "La fecha de fin del semestre es obligatoria")
    private LocalDate semesterEndDate;

    @NotNull(message = "El día de la semana es obligatorio")
    private DayOfWeek dayOfWeek;

    @NotNull(message = "La hora de inicio de la clase es obligatoria")
    private LocalTime startTime;

    @NotNull(message = "La hora de fin de la clase es obligatoria")
    private LocalTime endTime;

    private String purpose;
}