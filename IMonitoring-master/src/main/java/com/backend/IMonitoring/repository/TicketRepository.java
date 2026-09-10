package com.backend.IMonitoring.repository;

import com.backend.IMonitoring.model.Ticket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface TicketRepository extends JpaRepository<Ticket, Long> {


    List<Ticket> findByUsuarioIdOrderByFechaCreacionDesc(String usuarioId);

    List<Ticket> findAllByOrderByFechaCreacionDesc();
}