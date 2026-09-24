package com.backend.IMonitoring.dto;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TicketDTO {
    private Long id;
    private String titulo;
    private String descripcion;
    private String estado;
    private LocalDateTime fechaCreacion;
    private UserRef usuario;
    private ClassroomRef classroom;

    @Data
    public static class UserRef {
        private String id;
        private String name;
        private String email;
    }

    @Data
    public static class ClassroomRef {
        private String id;
        private String name;
    }
}