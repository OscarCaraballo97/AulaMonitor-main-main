package com.backend.IMonitoring.service;

import com.backend.IMonitoring.dto.TicketDTO;
import com.backend.IMonitoring.model.Classroom;
import com.backend.IMonitoring.model.Ticket;
import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.repository.ClassroomRepository;
import com.backend.IMonitoring.repository.TicketRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class TicketService {

    private final TicketRepository ticketRepository;
    private final AuditLogService auditLogService;
    private final ClassroomRepository classroomRepository;

    public TicketService(TicketRepository ticketRepository, AuditLogService auditLogService, ClassroomRepository classroomRepository) {
        this.ticketRepository = ticketRepository;
        this.auditLogService = auditLogService;
        this.classroomRepository = classroomRepository;
    }

    public TicketDTO crearTicket(TicketDTO request, User usuario) {
        Ticket ticket = new Ticket();
        ticket.setTitulo(request.getTitulo());
        ticket.setDescripcion(request.getDescripcion());
        ticket.setUsuario(usuario);
        ticket.setFechaCreacion(LocalDateTime.now());
        ticket.setEstado("PENDIENTE");

        String aulaNombre = "General";

            if (request.getClassroom() != null && request.getClassroom().getId() != null) {
            Classroom c = classroomRepository.findById(request.getClassroom().getId()).orElse(null);
            ticket.setClassroom(c);
            if (c != null) {
                aulaNombre = c.getName();
            }
        }

        Ticket nuevoTicket = ticketRepository.save(ticket);

        auditLogService.logAction(
                "TICKET_CREADO",
                usuario.getEmail(),
                "Creó un ticket para el espacio: " + aulaNombre + " | Título: " + ticket.getTitulo()
        );

        return convertToDTO(nuevoTicket);
    }

    public List<TicketDTO> obtenerMisTickets(String usuarioId) {
        return ticketRepository.findByUsuarioIdOrderByFechaCreacionDesc(usuarioId)
                .stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public List<TicketDTO> obtenerTodos() {
        return ticketRepository.findAllByOrderByFechaCreacionDesc()
                .stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public TicketDTO actualizarEstado(Long id, String nuevoEstado, User usuario) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Ticket no encontrado"));

        String estadoAnterior = ticket.getEstado();
        ticket.setEstado(nuevoEstado);
        Ticket ticketActualizado = ticketRepository.save(ticket);

        auditLogService.logAction(
                "ESTADO_TICKET_ACTUALIZADO",
                usuario.getEmail(),
                "Actualizó el ticket '" + ticket.getTitulo() + "' de [" + estadoAnterior + "] a [" + nuevoEstado + "]"
        );

        return convertToDTO(ticketActualizado);
    }

    public Map<String, Long> obtenerEstadisticasPorAula() {
        List<Ticket> tickets = ticketRepository.findAll();
        Map<String, Long> stats = new HashMap<>();

        for (Ticket t : tickets) {
            if (t.getClassroom() != null) {
                String nombreAula = t.getClassroom().getName();
                stats.put(nombreAula, stats.getOrDefault(nombreAula, 0L) + 1);
            }
        }
        return stats;
    }

    private TicketDTO convertToDTO(Ticket ticket) {
        TicketDTO dto = new TicketDTO();
        dto.setId(ticket.getId());
        dto.setTitulo(ticket.getTitulo());
        dto.setDescripcion(ticket.getDescripcion());
        dto.setEstado(ticket.getEstado());
        dto.setFechaCreacion(ticket.getFechaCreacion());

        if (ticket.getUsuario() != null) {
            TicketDTO.UserRef uRef = new TicketDTO.UserRef();
            uRef.setId(ticket.getUsuario().getId());
            uRef.setName(ticket.getUsuario().getName());
            uRef.setEmail(ticket.getUsuario().getEmail());
            dto.setUsuario(uRef);
        }

        if (ticket.getClassroom() != null) {
            TicketDTO.ClassroomRef cRef = new TicketDTO.ClassroomRef();
            cRef.setId(ticket.getClassroom().getId());
            cRef.setName(ticket.getClassroom().getName());
            dto.setClassroom(cRef);
        }

        return dto;
    }
}