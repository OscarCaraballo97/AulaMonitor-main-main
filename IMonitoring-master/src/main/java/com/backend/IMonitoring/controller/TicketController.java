package com.backend.IMonitoring.controller;

import com.backend.IMonitoring.model.Ticket;
import com.backend.IMonitoring.security.UserDetailsImpl;
import com.backend.IMonitoring.service.TicketService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tickets")
public class TicketController {

    private final TicketService ticketService;

    public TicketController(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    @PostMapping
    public ResponseEntity<?> crearTicket(@RequestBody Ticket ticket, @AuthenticationPrincipal UserDetails userDetails) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        ticketService.crearTicket(ticket, userDetailsImpl.getUserEntity());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket creado con éxito"
        ));
    }

    @GetMapping("/mis-tickets")
    public ResponseEntity<List<Ticket>> getMisTickets(@AuthenticationPrincipal UserDetails userDetails) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        return ResponseEntity.ok(ticketService.obtenerMisTickets(userDetailsImpl.getUserEntity().getId()));
    }

    @GetMapping("/todos")
    public ResponseEntity<List<Ticket>> getAllTickets() {
        return ResponseEntity.ok(ticketService.obtenerTodos());
    }

    @PatchMapping("/{id}/estado")
    public ResponseEntity<?> actualizarEstado(@PathVariable Long id, @RequestBody Map<String, String> request) {
        String nuevoEstado = request.get("estado");
        ticketService.actualizarEstado(id, nuevoEstado);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Estado actualizado con éxito"
        ));
    }
}