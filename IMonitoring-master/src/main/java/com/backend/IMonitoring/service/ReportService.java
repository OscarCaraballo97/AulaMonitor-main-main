package com.backend.IMonitoring.service;

import com.backend.IMonitoring.dto.*;
import com.backend.IMonitoring.model.*;
import com.backend.IMonitoring.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final ClassroomRepository classroomRepository;
    private final ReservationRepository reservationRepository;
    private final UserRepository userRepository;

    public List<ResourceReportDTO> getResourceReport(String specificResource) {
        List<Classroom> classrooms = classroomRepository.findAll();
        List<ResourceReportDTO> report = new ArrayList<>();

        for (Classroom room : classrooms) {
            Map<String, Integer> filteredResources = new HashMap<>();

            if (room.getResources() != null) {
                if (specificResource == null || specificResource.equalsIgnoreCase("ALL")) {
                    filteredResources.putAll(room.getResources());
                } else if (room.getResources().containsKey(specificResource)) {
                    filteredResources.put(specificResource, room.getResources().get(specificResource));
                }
            }

            if (specificResource != null && !specificResource.equalsIgnoreCase("ALL") && filteredResources.isEmpty()) {
                continue;
            }

            report.add(ResourceReportDTO.builder()
                    .classroomName(room.getName())
                    .buildingName(room.getBuilding() != null ? room.getBuilding().getName() : "Sin Edificio")
                    .resources(filteredResources)
                    .build());
        }
        return report;
    }

    public List<SpaceUsageDTO> getSpaceUsageStatistics() {
        List<Classroom> classrooms = classroomRepository.findAll();
        long totalReservationsGlobal = reservationRepository.count();

        return classrooms.stream().map(room -> {
                    long roomReservations = reservationRepository.countByClassroomId(room.getId());
                    double percentage = totalReservationsGlobal > 0 ? ((double) roomReservations / totalReservationsGlobal) * 100 : 0.0;

                    return SpaceUsageDTO.builder()
                            .classroomName(room.getName())
                            .totalReservations(roomReservations)
                            .usagePercentage(Math.round(percentage * 100.0) / 100.0)
                            .build();
                })
                .sorted(Comparator.comparingLong(SpaceUsageDTO::getTotalReservations).reversed())
                .collect(Collectors.toList());
    }

    public CancellationReportDTO getCancellationReport() {
        List<Reservation> cancelledAndRejected = reservationRepository.findAll().stream()
                .filter(r -> r.getStatus() == ReservationStatus.CANCELADA || r.getStatus() == ReservationStatus.RECHAZADA)
                .collect(Collectors.toList());

        long cancelledCount = cancelledAndRejected.stream().filter(r -> r.getStatus() == ReservationStatus.CANCELADA).count();
        long rejectedCount = cancelledAndRejected.stream().filter(r -> r.getStatus() == ReservationStatus.RECHAZADA).count();

        Map<String, Long> reasons = cancelledAndRejected.stream()
                .map(r -> r.getPurpose() != null && !r.getPurpose().trim().isEmpty() ? r.getPurpose() : "No especificado")
                .collect(Collectors.groupingBy(reasonsText -> reasonsText, Collectors.counting()));

        // --- LÓGICA DE DETALLES: A quién, dónde, cuándo y por qué ---
        List<RejectedReservationDTO> details = cancelledAndRejected.stream()
                .map(r -> RejectedReservationDTO.builder()
                        .userName(r.getUser() != null ? r.getUser().getName() : "Usuario Desconocido")
                        .classroomName(r.getClassroom() != null ? r.getClassroom().getName() : "Aula Desconocida")
                        .status(r.getStatus().name())
                        .reason(r.getPurpose() != null && !r.getPurpose().trim().isEmpty() ? r.getPurpose() : "Sin motivo registrado")
                        .date(r.getStartTime())
                        .build()
                )
                .sorted(Comparator.comparing(RejectedReservationDTO::getDate).reversed()) // Los más recientes primero
                .collect(Collectors.toList());

        return CancellationReportDTO.builder()
                .totalCancellations(cancelledCount)
                .totalRejected(rejectedCount)
                .reasonsCount(reasons)
                .details(details)
                .build();
    }

    public UserReportDTO getDetailedUserReport() {
        List<User> users = userRepository.findAll();

        Map<String, Long> byRole = users.stream()
                .collect(Collectors.groupingBy(u -> u.getRole().name(), Collectors.counting()));

        Map<String, Long> byInstitution = users.stream()
                .filter(u -> u.getInstitution() != null && !u.getInstitution().trim().isEmpty())
                .collect(Collectors.groupingBy(User::getInstitution, Collectors.counting()));

        Map<String, Long> byCareer = users.stream()
                .filter(u -> u.getCareer() != null && !u.getCareer().trim().isEmpty())
                .collect(Collectors.groupingBy(User::getCareer, Collectors.counting()));

        return UserReportDTO.builder()
                .totalUsers(users.size())
                .usersByRole(byRole)
                .usersByInstitution(byInstitution)
                .usersByCareer(byCareer)
                .build();
    }
}