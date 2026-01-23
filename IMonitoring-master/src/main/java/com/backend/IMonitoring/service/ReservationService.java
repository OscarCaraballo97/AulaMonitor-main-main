package com.backend.IMonitoring.service;

import com.backend.IMonitoring.dto.ReservationResponseDTO;
import com.backend.IMonitoring.dto.ClassroomSummaryDTO;
import com.backend.IMonitoring.dto.SemesterReservationRequestDTO;
import com.backend.IMonitoring.dto.UserSummaryDTO;
import com.backend.IMonitoring.model.*;
import com.backend.IMonitoring.repository.ClassroomRepository;
import com.backend.IMonitoring.repository.ReservationRepository;
import com.backend.IMonitoring.security.UserDetailsImpl;
import com.backend.IMonitoring.exceptions.ResourceNotFoundException;
import com.backend.IMonitoring.exceptions.UnauthorizedAccessException;
import com.backend.IMonitoring.exceptions.InvalidReservationException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ReservationService {
    private final ReservationRepository reservationRepository;
    private final ClassroomRepository classroomRepository;
    private final UserService userService;

    public ReservationResponseDTO convertToDTO(Reservation reservation) {
        if (reservation == null) return null;

        User userEntity = reservation.getUser();
        UserSummaryDTO userSummary = (userEntity != null) ?
                new UserSummaryDTO(userEntity.getId(), userEntity.getName(), userEntity.getEmail(), userEntity.getRole()) : null;

        Classroom classroomEntity = reservation.getClassroom();
        ClassroomSummaryDTO classroomSummary = null;
        if (classroomEntity != null) {
            String buildingName = (classroomEntity.getBuilding() != null) ? classroomEntity.getBuilding().getName() : null;
            classroomSummary = new ClassroomSummaryDTO(classroomEntity.getId(), classroomEntity.getName(), buildingName);
        }

        return ReservationResponseDTO.builder()
                .id(reservation.getId())
                .classroom(classroomSummary)
                .user(userSummary)
                .startTime(reservation.getStartTime())
                .endTime(reservation.getEndTime())
                .status(reservation.getStatus())
                .purpose(reservation.getPurpose())
                .createdAt(reservation.getCreatedAt())
                .updatedAt(reservation.getUpdatedAt())
                .build();
    }

    private List<ReservationResponseDTO> convertToDTOList(List<Reservation> reservations) {
        if (reservations == null) return List.of();
        return reservations.stream().map(this::convertToDTO).collect(Collectors.toList());
    }

    public Reservation getReservationById(String id) {
        return reservationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reserva no encontrada con ID: " + id));
    }

    public ReservationResponseDTO getReservationByIdDTO(String id) {
        return convertToDTO(getReservationById(id));
    }

    public List<ReservationResponseDTO> getAdminFilteredReservations(
            String classroomId, String userId, ReservationStatus status,
            LocalDateTime startDate, LocalDateTime endDate,
            String sortField, String sortDirection) {
        Sort sort = (sortField != null && !sortField.isEmpty()) ?
                Sort.by((sortDirection != null && sortDirection.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC), sortField) :
                Sort.by(Sort.Direction.DESC, "startTime");

        List<Reservation> reservationsList;
        if (status != null) {
            reservationsList = reservationRepository.findByStatus(status, sort);
        } else if (classroomId != null && !classroomId.isEmpty() && startDate != null && endDate != null) {
            reservationsList = reservationRepository.findByClassroomIdAndStartTimeBetween(classroomId, startDate, endDate, sort);
        } else if (userId != null && !userId.isEmpty()) {
            reservationsList = reservationRepository.findByUserId(userId, sort);
        } else {
            reservationsList = reservationRepository.findAll(sort);
        }
        return convertToDTOList(reservationsList);
    }

    public List<ReservationResponseDTO> getFilteredUserReservations(
            String userIdAuth, ReservationStatus status, String sortField, String sortDirection,
            Integer page, Integer size, boolean futureOnly, LocalDateTime startDate, LocalDateTime endDate) {

        Sort sort = (sortField != null && !sortField.isEmpty()) ?
                Sort.by((sortDirection != null && sortDirection.equalsIgnoreCase("desc") ? Sort.Direction.DESC : Sort.Direction.ASC), sortField) :
                Sort.by(Sort.Direction.DESC, "startTime");

        List<Reservation> reservationsList;
        if (startDate != null && endDate != null) {
            reservationsList = (status != null) ?
                    reservationRepository.findByUserIdAndStatusAndStartTimeBetween(userIdAuth, status, startDate, endDate, sort) :
                    reservationRepository.findByUserIdAndStartTimeBetween(userIdAuth, startDate, endDate, sort);
        } else if (futureOnly) {
            LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
            reservationsList = (status != null) ?
                    reservationRepository.findByUserIdAndStatusAndStartTimeAfter(userIdAuth, status, now, sort) :
                    reservationRepository.findByUserIdAndStartTimeAfter(userIdAuth, now, sort);
        } else {
            reservationsList = (status != null) ?
                    reservationRepository.findByUserIdAndStatus(userIdAuth, status, sort) :
                    reservationRepository.findByUserId(userIdAuth, sort);
        }
        return convertToDTOList(reservationsList);
    }

    @Transactional
    public List<ReservationResponseDTO> createSemesterReservations(SemesterReservationRequestDTO request, UserDetails currentUserDetails) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) currentUserDetails;
        User userPerformingAction = userDetailsImpl.getUserEntity();

        if (userPerformingAction.getRole() != Rol.ADMIN && userPerformingAction.getRole() != Rol.COORDINADOR) {
            throw new UnauthorizedAccessException("Solo Administradores o Coordinadores pueden asignar semestres completos.");
        }

        Classroom classroom = classroomRepository.findById(request.getClassroomId())
                .orElseThrow(() -> new ResourceNotFoundException("Aula no encontrada con ID: " + request.getClassroomId()));

        User professor = userService.getUserById(request.getProfessorId());

        if (request.getStartTime().isAfter(request.getEndTime()) || request.getStartTime().equals(request.getEndTime())) {
            throw new InvalidReservationException("La hora de inicio debe ser anterior a la de fin.");
        }

        List<Reservation> reservationsToSave = new ArrayList<>();
        LocalDate currentDate = request.getSemesterStartDate();

        while (currentDate.getDayOfWeek() != request.getDayOfWeek() && !currentDate.isAfter(request.getSemesterEndDate())) {
            currentDate = currentDate.plusDays(1);
        }

        if (currentDate.isAfter(request.getSemesterEndDate())) {
            throw new InvalidReservationException("El rango de fechas seleccionado no contiene ningún " + request.getDayOfWeek() + ".");
        }

        while (!currentDate.isAfter(request.getSemesterEndDate())) {
            LocalDateTime startDateTime = LocalDateTime.of(currentDate, request.getStartTime());
            LocalDateTime endDateTime = LocalDateTime.of(currentDate, request.getEndTime());

            boolean isAvailable = classroomRepository.isAvailableConsideringAllStatuses(
                    classroom.getId(), startDateTime, endDateTime
            );

            if (!isAvailable) {
                List<Reservation> conflicts = reservationRepository.findOverlappingReservations(
                        classroom.getId(), startDateTime, endDateTime
                );

                String conflictMsg = "Conflicto el " + currentDate;
                if (!conflicts.isEmpty()) {
                    Reservation conflict = conflicts.get(0);
                    DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");
                    conflictMsg += ". Ya existe una reserva de " +
                            conflict.getStartTime().format(timeFormatter) + " a " +
                            conflict.getEndTime().format(timeFormatter);
                    if (conflict.getUser() != null) {
                        conflictMsg += " (" + conflict.getUser().getName() + ")";
                    }
                } else {
                    conflictMsg += ". El aula está ocupada en ese horario.";
                }

                throw new InvalidReservationException(conflictMsg);
            }

            Reservation reservation = Reservation.builder()
                    .classroom(classroom)
                    .user(professor)
                    .startTime(startDateTime)
                    .endTime(endDateTime)
                    .purpose(request.getPurpose())
                    .status(ReservationStatus.CONFIRMADA)
                    .build();

            reservationsToSave.add(reservation);
            currentDate = currentDate.plusWeeks(1);
        }

        if (reservationsToSave.isEmpty()) {
            throw new InvalidReservationException("No se generaron reservas. Verifique fechas y día seleccionado.");
        }

        return convertToDTOList(reservationRepository.saveAll(reservationsToSave));
    }

    @Transactional
    public Reservation createReservation(Reservation reservationInput, UserDetails currentUserDetails) {
        if (reservationInput.getClassroom() == null || reservationInput.getClassroom().getId() == null) {
            throw new InvalidReservationException("ID del aula requerido.");
        }
        Classroom classroom = classroomRepository.findById(reservationInput.getClassroom().getId())
                .orElseThrow(() -> new ResourceNotFoundException("Aula no encontrada."));
        reservationInput.setClassroom(classroom);

        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) currentUserDetails;
        User userMakingReservation = userDetailsImpl.getUserEntity();
        User userToReserveFor;

        boolean isPrivileged = userMakingReservation.getRole() == Rol.ADMIN || userMakingReservation.getRole() == Rol.COORDINADOR;

        if (isPrivileged && reservationInput.getUser() != null && reservationInput.getUser().getId() != null &&
                !Objects.equals(reservationInput.getUser().getId(), userMakingReservation.getId())) {
            userToReserveFor = userService.getUserById(reservationInput.getUser().getId());
        } else {
            userToReserveFor = userMakingReservation;
        }
        reservationInput.setUser(userToReserveFor);

        if (reservationInput.getStartTime() == null || reservationInput.getEndTime() == null) {
            throw new InvalidReservationException("Fechas de inicio y fin requeridas.");
        }
        if (!reservationInput.getStartTime().isBefore(reservationInput.getEndTime())) {
            throw new InvalidReservationException("La fecha de inicio debe ser anterior a la fecha de fin.");
        }

        boolean isAvailable = classroomRepository.isAvailableConsideringAllStatuses(
                reservationInput.getClassroom().getId(), reservationInput.getStartTime(), reservationInput.getEndTime()
        );

        if (!isAvailable) {
            List<Reservation> conflicts = reservationRepository.findOverlappingReservations(
                    classroom.getId(), reservationInput.getStartTime(), reservationInput.getEndTime()
            );
            String conflictMsg = "Aula no disponible.";
            if (!conflicts.isEmpty()) {
                Reservation conflict = conflicts.get(0);
                DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");
                conflictMsg = "Conflicto con reserva existente: " +
                        conflict.getStartTime().format(timeFormatter) + " - " +
                        conflict.getEndTime().format(timeFormatter);
                if (conflict.getUser() != null) {
                    conflictMsg += " (" + conflict.getUser().getName() + ")";
                }
            }
            throw new InvalidReservationException(conflictMsg);
        }

        ReservationStatus finalStatus = ReservationStatus.PENDIENTE;

        if (userMakingReservation.getRole() == Rol.ADMIN || userMakingReservation.getRole() == Rol.COORDINADOR) {
            finalStatus = ReservationStatus.CONFIRMADA;
        }

        if (userMakingReservation.getRole() == Rol.ADMIN && reservationInput.getStatus() != null) {
            reservationInput.setStatus(reservationInput.getStatus());
        } else {
            reservationInput.setStatus(finalStatus);
        }

        return reservationRepository.save(reservationInput);
    }

    @Transactional
    public Reservation updateReservationStatus(String id, ReservationStatus newStatus, UserDetails adminOrCoordinatorDetails) {
        UserDetailsImpl userDetails = (UserDetailsImpl) adminOrCoordinatorDetails;
        User user = userDetails.getUserEntity();
        Reservation reservation = getReservationById(id);

        boolean isAdmin = user.getRole() == Rol.ADMIN;
        boolean isCoordinator = user.getRole() == Rol.COORDINADOR;

        if (!isAdmin && !isCoordinator) throw new UnauthorizedAccessException("Permiso denegado.");
        if (isCoordinator && (reservation.getUser() == null || reservation.getUser().getRole() != Rol.ESTUDIANTE) && !Objects.equals(reservation.getUser().getId(), user.getId())) {
            throw new UnauthorizedAccessException("Coordinadores solo gestionan reservas de estudiantes o propias.");
        }

        if (newStatus == ReservationStatus.CONFIRMADA) {
            if (!classroomRepository.isAvailableExcludingReservationConsideringAllStatuses(
                    reservation.getClassroom().getId(), reservation.getStartTime(), reservation.getEndTime(), reservation.getId())) {
                throw new InvalidReservationException("Conflicto de horario al confirmar.");
            }
        }
        reservation.setStatus(newStatus);
        return reservationRepository.save(reservation);
    }

    @Transactional
    public Reservation updateReservation(String id, Reservation updatedData, UserDetails userDetails) {
        Reservation reservation = getReservationById(id);

        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userUpdating = userDetailsImpl.getUserEntity();
        boolean isAdmin = userUpdating.getRole().equals(Rol.ADMIN);
        boolean isCoordinator = userUpdating.getRole().equals(Rol.COORDINADOR);
        boolean isOwner = reservation.getUser() != null && Objects.equals(reservation.getUser().getId(), userUpdating.getId());

        if (!isAdmin) {
            if (isCoordinator) {
                boolean isStudentReservation = reservation.getUser() != null && reservation.getUser().getRole() == Rol.ESTUDIANTE;
                if (!((isStudentReservation && (reservation.getStatus() == ReservationStatus.PENDIENTE || reservation.getStatus() == ReservationStatus.CONFIRMADA)) ||
                        (isOwner && reservation.getStatus() == ReservationStatus.PENDIENTE))) {
                    throw new UnauthorizedAccessException("Coordinadores pueden modificar reservas de estudiantes (pendientes o confirmadas), o las propias si están pendientes.");
                }
            } else if (isOwner) {
                if (reservation.getStatus() != ReservationStatus.PENDIENTE) {
                    throw new InvalidReservationException("Solo puedes modificar tus propias reservas si están en estado PENDIENTE.");
                }
            } else {
                throw new UnauthorizedAccessException("No tienes permiso.");
            }
        }

        reservation.setStartTime(updatedData.getStartTime());
        reservation.setEndTime(updatedData.getEndTime());
        reservation.setPurpose(updatedData.getPurpose());

        if (updatedData.getClassroom() != null && updatedData.getClassroom().getId() != null &&
                !Objects.equals(reservation.getClassroom().getId(), updatedData.getClassroom().getId())) {
            Classroom newClassroom = classroomRepository.findById(updatedData.getClassroom().getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Aula no encontrada"));
            reservation.setClassroom(newClassroom);
        }

        if (updatedData.getUser() != null && updatedData.getUser().getId() != null &&
                !Objects.equals(reservation.getUser().getId(), updatedData.getUser().getId())) {
            if (!isAdmin && !isCoordinator) {
                throw new UnauthorizedAccessException("No tienes permiso para reasignar el usuario de esta reserva.");
            }
            User newUser = userService.getUserById(updatedData.getUser().getId());
            reservation.setUser(newUser);
        }

        if (isAdmin && updatedData.getStatus() != null && reservation.getStatus() != updatedData.getStatus()) {
            if (updatedData.getStatus() == ReservationStatus.CONFIRMADA) {
                if (!classroomRepository.isAvailableExcludingReservationConsideringAllStatuses(
                        reservation.getClassroom().getId(),
                        reservation.getStartTime(),
                        reservation.getEndTime(),
                        reservation.getId()
                )) {
                    throw new InvalidReservationException("No se puede confirmar la reserva al actualizar. El aula y horario entran en conflicto.");
                }
            }
            reservation.setStatus(updatedData.getStatus());
        }

        if (!classroomRepository.isAvailableExcludingReservationConsideringAllStatuses(
                reservation.getClassroom().getId(), reservation.getStartTime(), reservation.getEndTime(), id)) {

            List<Reservation> conflicts = reservationRepository.findOverlappingReservations(
                    reservation.getClassroom().getId(), reservation.getStartTime(), reservation.getEndTime()
            );
            String conflictMsg = "Conflicto de horario.";
            if(!conflicts.isEmpty()) {
                Reservation c = conflicts.stream().filter(r -> !r.getId().equals(id)).findFirst().orElse(null);
                if(c != null) {
                    DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");
                    conflictMsg += " Ocupado por: " + c.getStartTime().format(timeFormatter) + " - " + c.getEndTime().format(timeFormatter);
                    if (c.getUser() != null) {
                        conflictMsg += " (" + c.getUser().getName() + ")";
                    }
                }
            }
            throw new InvalidReservationException(conflictMsg);
        }
        return reservationRepository.save(reservation);
    }

    // --- NUEVO MÉTODO PARA ACTUALIZAR SEMESTRE COMPLETO ---
    @Transactional
    public List<ReservationResponseDTO> updateSemesterReservations(String originalId, Reservation updatedData, UserDetails userDetails) {
        Reservation original = getReservationById(originalId);
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userUpdating = userDetailsImpl.getUserEntity();

        boolean isAdmin = userUpdating.getRole().equals(Rol.ADMIN);
        boolean isCoordinator = userUpdating.getRole().equals(Rol.COORDINADOR);
        boolean isOwner = original.getUser() != null && Objects.equals(original.getUser().getId(), userUpdating.getId());

        if (!isAdmin && !isCoordinator && !isOwner) {
            throw new UnauthorizedAccessException("No tienes permiso para modificar este semestre.");
        }

        // Buscar reservas futuras con el mismo patrón (mismo usuario, propósito y hora)
        List<Reservation> semesterSeries = reservationRepository.findFutureReservationsByPattern(
                original.getUser().getId(),
                original.getPurpose(),
                original.getClassroom().getId(),
                original.getStartTime()
        );

        // Filtrar para asegurarnos que sean del mismo día de la semana y misma hora
        List<Reservation> filteredSeries = semesterSeries.stream()
                .filter(r -> r.getStartTime().getDayOfWeek() == original.getStartTime().getDayOfWeek() &&
                        r.getStartTime().toLocalTime().equals(original.getStartTime().toLocalTime()))
                .collect(Collectors.toList());

        if (filteredSeries.isEmpty()) {
            filteredSeries.add(original);
        }

        List<Reservation> updatedList = new ArrayList<>();

        java.time.LocalTime newStartTime = updatedData.getStartTime().toLocalTime();
        java.time.LocalTime newEndTime = updatedData.getEndTime().toLocalTime();

        Classroom newClassroom = null;
        if (updatedData.getClassroom() != null) {
            newClassroom = classroomRepository.findById(updatedData.getClassroom().getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Nueva aula no encontrada"));
        }

        for (Reservation res : filteredSeries) {
            // Mantener fecha original, cambiar hora
            LocalDateTime targetStart = res.getStartTime().toLocalDate().atTime(newStartTime);
            LocalDateTime targetEnd = res.getEndTime().toLocalDate().atTime(newEndTime);

            // Verificar conflicto individual
            if (!classroomRepository.isAvailableExcludingReservationConsideringAllStatuses(
                    (newClassroom != null ? newClassroom.getId() : res.getClassroom().getId()),
                    targetStart, targetEnd, res.getId())) {
                throw new InvalidReservationException("Conflicto de horario el día: " + res.getStartTime().toLocalDate() + ". No se puede actualizar toda la serie.");
            }

            res.setStartTime(targetStart);
            res.setEndTime(targetEnd);
            res.setPurpose(updatedData.getPurpose());
            if (newClassroom != null) {
                res.setClassroom(newClassroom);
            }

            // Re-confirmar si es admin/coord
            if (isAdmin || isCoordinator) {
                res.setStatus(ReservationStatus.CONFIRMADA);
            } else {
                res.setStatus(ReservationStatus.PENDIENTE);
            }

            updatedList.add(res);
        }

        return convertToDTOList(reservationRepository.saveAll(updatedList));
    }

    @Transactional
    public Reservation cancelMyReservation(String id, UserDetails userDetails) {
        Reservation reservation = getReservationById(id);
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userCancelling = userDetailsImpl.getUserEntity();

        boolean isAdmin = userCancelling.getRole() == Rol.ADMIN;
        boolean isCoordinator = userCancelling.getRole() == Rol.COORDINADOR;
        boolean isOwner = reservation.getUser() != null && Objects.equals(reservation.getUser().getId(), userCancelling.getId());

        if (!isAdmin) {
            if (isCoordinator) {
                boolean isStudentReservation = reservation.getUser() != null && reservation.getUser().getRole() == Rol.ESTUDIANTE;
                if (!isStudentReservation && !isOwner) {
                    throw new UnauthorizedAccessException("Coordinadores solo pueden cancelar reservas de estudiantes o las propias.");
                }
            } else if (!isOwner) {
                throw new UnauthorizedAccessException("No tienes permiso para cancelar esta reserva.");
            }
        }

        if (reservation.getStatus() == ReservationStatus.PENDIENTE || reservation.getStatus() == ReservationStatus.CONFIRMADA) {
            reservation.setStatus(ReservationStatus.CANCELADA);
            return reservationRepository.save(reservation);
        } else {
            throw new InvalidReservationException("Solo se pueden cancelar reservas PENDIENTES o CONFIRMADAS. Estado actual: " + reservation.getStatus());
        }
    }

    @Transactional
    public void deleteReservation(String id, UserDetails userDetails) {
        Reservation reservation = this.getReservationById(id);
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userDeleting = userDetailsImpl.getUserEntity();

        boolean isAdmin = userDeleting.getRole() == Rol.ADMIN;
        boolean isCoordinatorWithPermission = userDeleting.getRole() == Rol.COORDINADOR &&
                reservation.getUser() != null &&
                (reservation.getUser().getRole() == Rol.ESTUDIANTE || Objects.equals(reservation.getUser().getId(), userDeleting.getId())) &&
                (reservation.getStatus() == ReservationStatus.PENDIENTE ||
                        reservation.getStatus() == ReservationStatus.CANCELADA ||
                        reservation.getStatus() == ReservationStatus.RECHAZADA);

        boolean isOwnerAndAllowedStatus = reservation.getUser() != null &&
                Objects.equals(reservation.getUser().getId(), userDeleting.getId()) &&
                (reservation.getStatus() == ReservationStatus.PENDIENTE ||
                        reservation.getStatus() == ReservationStatus.CANCELADA ||
                        reservation.getStatus() == ReservationStatus.RECHAZADA);

        if (isAdmin || isOwnerAndAllowedStatus || isCoordinatorWithPermission) {
            reservationRepository.deleteById(id);
        } else {
            throw new UnauthorizedAccessException("No tienes permiso para eliminar esta reserva o el estado actual no lo permite.");
        }
    }

    public List<ReservationResponseDTO> getReservationsByStatusDTO(ReservationStatus status) {
        return convertToDTOList(reservationRepository.findByStatus(status, Sort.by(Sort.Direction.DESC, "startTime")));
    }
    public List<ReservationResponseDTO> getUpcomingReservationsDTO(int limit) {
        return convertToDTOList(reservationRepository.findByStatusAndStartTimeAfter(ReservationStatus.CONFIRMADA, LocalDateTime.now(ZoneOffset.UTC), Sort.by(Sort.Direction.ASC, "startTime"))
                .stream().limit(limit).collect(Collectors.toList()));
    }
    public List<ReservationResponseDTO> getMyUpcomingReservationsDTO(String userId, int limit) {
        return convertToDTOList(reservationRepository.findUpcomingConfirmedByUserId(userId, LocalDateTime.now(ZoneOffset.UTC), Sort.by(Sort.Direction.ASC, "startTime"))
                .stream().limit(limit).collect(Collectors.toList()));
    }
    public List<ReservationResponseDTO> getCurrentReservationsDTO() {
        return convertToDTOList(reservationRepository.findCurrentReservations(LocalDateTime.now(ZoneOffset.UTC)));
    }
    public List<ReservationResponseDTO> getReservationsByUserIdDTO(String userId) {
        return convertToDTOList(reservationRepository.findByUserId(userId, Sort.by(Sort.Direction.DESC, "startTime")));
    }
}