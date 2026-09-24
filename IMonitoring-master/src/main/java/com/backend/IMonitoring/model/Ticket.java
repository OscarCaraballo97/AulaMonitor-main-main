package com.backend.IMonitoring.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
public class Ticket {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String titulo;
    private String descripcion;
    private String estado;
    private LocalDateTime fechaCreacion = LocalDateTime.now();

    @ManyToOne
    private User usuario;

    @ManyToOne
    @JoinColumn(name = "classroom_id")
    private Classroom classroom;
}