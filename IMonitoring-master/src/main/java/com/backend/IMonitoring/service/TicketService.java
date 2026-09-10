package com.backend.IMonitoring.service;

import com.backend.IMonitoring.model.Ticket;
import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.repository.TicketRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class TicketService {

    private final TicketRepository ticketRepository;

    public TicketService(TicketRepository ticketRepository) {
        this.ticketRepository = ticketRepository;
    }

    public Ticket crearTicket(Ticket ticket, User usuario) {
        ticket.setUsuario(usuario);
        ticket.setFechaCreacion(LocalDateTime.now());
        ticket.setEstado("PENDIENTE"); // Estado por defecto
        return ticketRepository.save(ticket);
    }

    public List<Ticket> obtenerMisTickets(String usuarioId) {
        return ticketRepository.findByUsuarioIdOrderByFechaCreacionDesc(usuarioId);
    }

    public List<Ticket> obtenerTodos() {
        return ticketRepository.findAllByOrderByFechaCreacionDesc();
    }

    public Ticket actualizarEstado(Long id, String nuevoEstado) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Ticket no encontrado"));

        ticket.setEstado(nuevoEstado);
        return ticketRepository.save(ticket);
    }
}