package com.backend.IMonitoring.controller;

import com.backend.IMonitoring.dto.TicketDTO;
import com.backend.IMonitoring.security.UserDetailsImpl;
import com.backend.IMonitoring.service.TicketService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tickets")
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class TicketController {

    private final TicketService ticketService;

    public TicketController(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> crearTicket(
            @RequestBody TicketDTO ticketRequest,
            @AuthenticationPrincipal UserDetails userDetails) {

        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        TicketDTO creado = ticketService.crearTicket(ticketRequest, userDetailsImpl.getUserEntity());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket creado con éxito",
                "ticket", creado
        ));
    }

    @GetMapping("/mis-tickets")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<TicketDTO>> getMisTickets(@AuthenticationPrincipal UserDetails userDetails) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        return ResponseEntity.ok(ticketService.obtenerMisTickets(userDetailsImpl.getUserEntity().getId()));
    }

    @GetMapping("/todos")
    @PreAuthorize("hasAnyRole('ADMIN', 'COORDINADOR')")
    public ResponseEntity<List<TicketDTO>> getAllTickets() {
        return ResponseEntity.ok(ticketService.obtenerTodos());
    }

    @PatchMapping("/{id}/estado")
    @PreAuthorize("hasAnyRole('ADMIN', 'COORDINADOR')")
    public ResponseEntity<?> actualizarEstado(
            @PathVariable Long id,
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal UserDetails userDetails) {

        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        String nuevoEstado = request.get("estado");
        ticketService.actualizarEstado(id, nuevoEstado, userDetailsImpl.getUserEntity());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Estado actualizado con éxito"
        ));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'COORDINADOR')")
    public ResponseEntity<Map<String, Long>> obtenerEstadisticas() {
        return ResponseEntity.ok(ticketService.obtenerEstadisticasPorAula());
    }
}