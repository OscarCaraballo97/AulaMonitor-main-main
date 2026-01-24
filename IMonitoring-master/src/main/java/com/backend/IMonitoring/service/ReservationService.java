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
import com.backend.IMonitoring.utils.CareerUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset; // Import agregado
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.*;
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
                .groupId(reservation.getGroupId())
                .recurrenceDetails(reservation.getRecurrenceDetails())
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
        Reservation res = getReservationById(id);
        ReservationResponseDTO dto = convertToDTO(res);

        if (res.getGroupId() != null) {
            List<Reservation> groupReservations = reservationRepository.findByGroupId(res.getGroupId());
            if (!groupReservations.isEmpty()) {
                LocalDateTime minStart = groupReservations.stream()
                        .map(Reservation::getStartTime)
                        .min(LocalDateTime::compareTo)
                        .orElse(res.getStartTime());

                LocalDateTime maxEnd = groupReservations.stream()
                        .map(Reservation::getEndTime)
                        .max(LocalDateTime::compareTo)
                        .orElse(res.getEndTime());

                List<String> days = groupReservations.stream()
                        .map(r -> r.getStartTime().getDayOfWeek().name())
                        .distinct()
                        .collect(Collectors.toList());

                dto.setSemesterStartDate(minStart.toLocalDate());
                dto.setSemesterEndDate(maxEnd.toLocalDate());
                dto.setDaysOfWeek(days);
            }
        }
        return dto;
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

    // CORRECCIÓN: Eliminados parámetros 'page' y 'size' no usados para limpiar warnings
    public List<ReservationResponseDTO> getFilteredUserReservations(
            String userIdAuth, ReservationStatus status, String sortField, String sortDirection,
            boolean futureOnly, LocalDateTime startDate, LocalDateTime endDate) {

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

        User professor = userService.getUserById(request.getProfessorId());

        if (userPerformingAction.getRole() == Rol.COORDINADOR) {
            if (!CareerUtils.areSameCareerGroup(userPerformingAction.getCareer(), professor.getCareer())) {
                throw new UnauthorizedAccessException("Solo puedes asignar semestres a profesores de tu mismo grupo académico.");
            }
        }

        Classroom classroom = classroomRepository.findById(request.getClassroomId())
                .orElseThrow(() -> new ResourceNotFoundException("Aula no encontrada."));

        if (!request.getStartTime().isBefore(request.getEndTime())) {
            throw new InvalidReservationException("La hora de inicio debe ser anterior a la de fin.");
        }

        if (request.getDaysOfWeek() == null || request.getDaysOfWeek().isEmpty()) {
            throw new InvalidReservationException("Debe seleccionar al menos un día de la semana.");
        }

        String seriesGroupId = UUID.randomUUID().toString();

        List<String> daysAsStrings = request.getDaysOfWeek().stream()
                .map(DayOfWeek::name)
                .collect(Collectors.toList());
        String recurrenceText = generateRecurrenceString(daysAsStrings);

        List<Reservation> reservationsToSave = new ArrayList<>();
        LocalDate currentDate = request.getSemesterStartDate();

        if (currentDate.isAfter(request.getSemesterEndDate())) {
            throw new InvalidReservationException("La fecha de inicio del semestre no puede ser posterior al fin.");
        }

        while (!currentDate.isAfter(request.getSemesterEndDate())) {
            if (request.getDaysOfWeek().contains(currentDate.getDayOfWeek())) {

                LocalDateTime startDateTime = LocalDateTime.of(currentDate, request.getStartTime());
                LocalDateTime endDateTime = LocalDateTime.of(currentDate, request.getEndTime());

                checkAvailabilityOrThrow(classroom.getId(), startDateTime, endDateTime, null);

                Reservation reservation = Reservation.builder()
                        .classroom(classroom)
                        .user(professor)
                        .startTime(startDateTime)
                        .endTime(endDateTime)
                        .purpose(request.getPurpose())
                        .status(ReservationStatus.CONFIRMADA)
                        .groupId(seriesGroupId)
                        .recurrenceDetails(recurrenceText)
                        .build();

                reservationsToSave.add(reservation);
            }
            currentDate = currentDate.plusDays(1);
        }

        if (reservationsToSave.isEmpty()) {
            throw new InvalidReservationException("No se generaron reservas.");
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

            if (userMakingReservation.getRole() == Rol.COORDINADOR) {
                if (!CareerUtils.areSameCareerGroup(userMakingReservation.getCareer(), userToReserveFor.getCareer())) {
                    throw new UnauthorizedAccessException("Solo puedes crear reservas para usuarios de tu mismo grupo académico.");
                }
            }
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

        checkAvailabilityOrThrow(classroom.getId(), reservationInput.getStartTime(), reservationInput.getEndTime(), null);

        ReservationStatus finalStatus = ReservationStatus.PENDIENTE;
        if (userMakingReservation.getRole() == Rol.ADMIN || userMakingReservation.getRole() == Rol.COORDINADOR) {
            finalStatus = ReservationStatus.CONFIRMADA;
        }

        if (userMakingReservation.getRole() == Rol.ADMIN && reservationInput.getStatus() != null) {
            reservationInput.setStatus(reservationInput.getStatus());
        } else {
            reservationInput.setStatus(finalStatus);
        }

        reservationInput.setGroupId(null);
        reservationInput.setRecurrenceDetails(null);

        return reservationRepository.save(reservationInput);
    }

    @Transactional
    public List<ReservationResponseDTO> updateReservationSmart(String id, Reservation updatedData, List<String> newDaysOfWeek, UserDetails userDetails, boolean editSeries) {
        Reservation originalReservation = getReservationById(id);

        validateUpdatePermissions(originalReservation, userDetails, updatedData);

        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        boolean isCoordinatorOrAdmin = userDetailsImpl.getUserEntity().getRole() == Rol.COORDINADOR || userDetailsImpl.getUserEntity().getRole() == Rol.ADMIN;

        boolean isSeries = originalReservation.getGroupId() != null;
        if (editSeries && !isSeries) {
            editSeries = false;
        }

        List<Reservation> results = new ArrayList<>();

        if (editSeries) {
            String groupId = originalReservation.getGroupId();
            List<Reservation> groupReservations = reservationRepository.findByGroupId(groupId);
            LocalDateTime now = LocalDateTime.now();

            LocalDateTime semesterEndDateTime = groupReservations.stream()
                    .map(Reservation::getEndTime)
                    .max(LocalDateTime::compareTo)
                    .orElse(originalReservation.getEndTime());

            if (newDaysOfWeek != null && !newDaysOfWeek.isEmpty()) {
                syncSemesterDays(groupId, groupReservations, newDaysOfWeek, updatedData, semesterEndDateTime, now);
                groupReservations = reservationRepository.findByGroupId(groupId);
            }

            List<Reservation> futureReservations = groupReservations.stream()
                    .filter(r -> r.getEndTime().isAfter(now))
                    .collect(Collectors.toList());

            if (!futureReservations.contains(originalReservation) && originalReservation.getEndTime().isAfter(now)) {
                if (reservationRepository.existsById(originalReservation.getId())) {
                    futureReservations.add(originalReservation);
                }
            }

            String newRecurrenceDetails = (newDaysOfWeek != null && !newDaysOfWeek.isEmpty()) ?
                    generateRecurrenceString(newDaysOfWeek) : originalReservation.getRecurrenceDetails();

            for (Reservation res : futureReservations) {
                applyChangesToReservation(res, updatedData, true);
                res.setRecurrenceDetails(newRecurrenceDetails);
                if (isCoordinatorOrAdmin) {
                    res.setStatus(ReservationStatus.CONFIRMADA);
                }
                results.add(res);
            }
            return convertToDTOList(reservationRepository.saveAll(results));

        } else {
            if (isSeries) {
                originalReservation.setGroupId(null);
                originalReservation.setRecurrenceDetails(null);
            }
            applyChangesToReservation(originalReservation, updatedData, false);
            return List.of(convertToDTO(reservationRepository.save(originalReservation)));
        }
    }

    private void syncSemesterDays(String groupId, List<Reservation> currentReservations, List<String> targetDays, Reservation baseData, LocalDateTime semesterEnd, LocalDateTime now) {
        List<Reservation> futureReservations = currentReservations.stream()
                .filter(r -> r.getStartTime().isAfter(now))
                .collect(Collectors.toList());

        Set<LocalDate> coveredDates = new HashSet<>();

        for (Reservation res : futureReservations) {
            String dayName = res.getStartTime().getDayOfWeek().name();
            if (!targetDays.contains(dayName)) {
                reservationRepository.delete(res);
            } else {
                coveredDates.add(res.getStartTime().toLocalDate());
            }
        }

        LocalDate startDate = now.toLocalDate();
        LocalDate endDate = semesterEnd.toLocalDate();
        String newRecurrenceText = generateRecurrenceString(targetDays);

        long daysBetween = ChronoUnit.DAYS.between(startDate, endDate);
        List<Reservation> newReservations = new ArrayList<>();

        for (int i = 0; i <= daysBetween; i++) {
            LocalDate currentDate = startDate.plusDays(i);
            String dayName = currentDate.getDayOfWeek().name();

            if (targetDays.contains(dayName) && !coveredDates.contains(currentDate)) {
                LocalDateTime startDT = LocalDateTime.of(currentDate, baseData.getStartTime().toLocalTime());
                LocalDateTime endDT = LocalDateTime.of(currentDate, baseData.getEndTime().toLocalTime());

                checkAvailabilityOrThrow(baseData.getClassroom().getId(), startDT, endDT, null);

                Reservation newRes = Reservation.builder()
                        .classroom(baseData.getClassroom())
                        .user(baseData.getUser())
                        .purpose(baseData.getPurpose())
                        .startTime(startDT)
                        .endTime(endDT)
                        .status(ReservationStatus.CONFIRMADA)
                        .groupId(groupId)
                        .recurrenceDetails(newRecurrenceText)
                        .build();

                newReservations.add(newRes);
            }
        }
        if (!newReservations.isEmpty()) {
            reservationRepository.saveAll(newReservations);
        }
    }

    private String generateRecurrenceString(List<String> days) {
        return days.stream()
                .map(d -> DayOfWeek.valueOf(d.toUpperCase()))
                .sorted()
                // CORRECCIÓN: Uso de Locale.forLanguageTag para evitar warnings
                .map(d -> d.getDisplayName(TextStyle.FULL, Locale.forLanguageTag("es-ES")).toUpperCase())
                .collect(Collectors.joining(" - "));
    }

    private void applyChangesToReservation(Reservation target, Reservation source, boolean isBatchUpdate) {
        LocalDateTime newStart;
        LocalDateTime newEnd;

        if (isBatchUpdate) {
            LocalTime newStartTime = source.getStartTime().toLocalTime();
            LocalTime newEndTime = source.getEndTime().toLocalTime();
            newStart = target.getStartTime().toLocalDate().atTime(newStartTime);
            newEnd = target.getEndTime().toLocalDate().atTime(newEndTime);
        } else {
            newStart = source.getStartTime();
            newEnd = source.getEndTime();
        }

        if (source.getClassroom() != null && source.getClassroom().getId() != null) {
            Classroom newClassroom = classroomRepository.findById(source.getClassroom().getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Aula no encontrada"));
            target.setClassroom(newClassroom);
        }

        checkAvailabilityOrThrow(target.getClassroom().getId(), newStart, newEnd, target.getId());

        target.setStartTime(newStart);
        target.setEndTime(newEnd);
        target.setPurpose(source.getPurpose());

        if (source.getStatus() != null) {
            target.setStatus(source.getStatus());
        }

        if (source.getUser() != null && source.getUser().getId() != null) {
            User newUser = userService.getUserById(source.getUser().getId());
            target.setUser(newUser);
        }
    }

    private void checkAvailabilityOrThrow(String classroomId, LocalDateTime start, LocalDateTime end, String excludeReservationId) {
        boolean available;
        if (excludeReservationId == null) {
            available = classroomRepository.isAvailableConsideringAllStatuses(classroomId, start, end);
        } else {
            available = classroomRepository.isAvailableExcludingReservationConsideringAllStatuses(classroomId, start, end, excludeReservationId);
        }

        if (!available) {
            List<Reservation> conflicts = (excludeReservationId == null)
                    ? reservationRepository.findOverlappingReservations(classroomId, start, end)
                    : reservationRepository.findOverlappingReservations(classroomId, start, end).stream()
                    .filter(r -> !r.getId().equals(excludeReservationId)).collect(Collectors.toList());

            if (!conflicts.isEmpty()) {
                Reservation conflict = conflicts.get(0);

                // CORRECCIÓN: Uso de Locale.forLanguageTag
                DateTimeFormatter dayFormatter = DateTimeFormatter.ofPattern("EEEE dd 'de' MMMM", Locale.forLanguageTag("es-ES"));
                DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");

                String conflictDay = conflict.getStartTime().format(dayFormatter);
                String conflictStart = conflict.getStartTime().format(timeFormatter);
                String conflictEnd = conflict.getEndTime().format(timeFormatter);
                String conflictUser = (conflict.getUser() != null) ? conflict.getUser().getName() : "Usuario desconocido";
                String conflictPurpose = (conflict.getPurpose() != null) ? conflict.getPurpose() : "Sin propósito";

                String msg = String.format("Conflicto el %s de %s a %s. Ocupado por: '%s' (%s).",
                        conflictDay, conflictStart, conflictEnd, conflictPurpose, conflictUser);

                throw new InvalidReservationException(msg);
            } else {
                throw new InvalidReservationException("El horario seleccionado no está disponible.");
            }
        }
    }

    // CORRECCIÓN: Este es el método que te faltaba
    private void validateUpdatePermissions(Reservation reservation, UserDetails userDetails, Reservation updatedData) {
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userUpdating = userDetailsImpl.getUserEntity();

        boolean isAdmin = userUpdating.getRole() == Rol.ADMIN;
        boolean isCoordinator = userUpdating.getRole() == Rol.COORDINADOR;
        boolean isOwner = reservation.getUser() != null && Objects.equals(reservation.getUser().getId(), userUpdating.getId());

        if (isAdmin) return;

        if (isCoordinator) {
            if (reservation.getUser() != null && !CareerUtils.areSameCareerGroup(userUpdating.getCareer(), reservation.getUser().getCareer())) {
                throw new UnauthorizedAccessException("No puedes gestionar reservas de otro grupo académico.");
            }
            if (updatedData.getUser() != null && updatedData.getUser().getId() != null) {
                User newUser = userService.getUserById(updatedData.getUser().getId());
                if (!CareerUtils.areSameCareerGroup(userUpdating.getCareer(), newUser.getCareer())) {
                    throw new UnauthorizedAccessException("No puedes asignar reservas a usuarios fuera de tu grupo.");
                }
            }
            return;
        }

        if (isOwner) {
            if (reservation.getStatus() != ReservationStatus.PENDIENTE) {
                throw new InvalidReservationException("Solo puedes editar tus reservas si están PENDIENTES.");
            }
            if (updatedData.getUser() != null && !updatedData.getUser().getId().equals(userUpdating.getId())) {
                throw new UnauthorizedAccessException("No puedes transferir tu reserva a otro usuario.");
            }
            return;
        }

        throw new UnauthorizedAccessException("No tienes permiso para editar esta reserva.");
    }

    @Transactional
    public Reservation updateReservationStatus(String id, ReservationStatus newStatus, UserDetails adminOrCoordinatorDetails) {
        Reservation reservation = getReservationById(id);
        UserDetailsImpl userDetails = (UserDetailsImpl) adminOrCoordinatorDetails;
        User user = userDetails.getUserEntity();

        boolean isAdmin = user.getRole() == Rol.ADMIN;
        boolean isCoordinator = user.getRole() == Rol.COORDINADOR;

        if (!isAdmin && !isCoordinator) throw new UnauthorizedAccessException("Permiso denegado.");

        if (isCoordinator) {
            if (reservation.getUser() != null && !CareerUtils.areSameCareerGroup(user.getCareer(), reservation.getUser().getCareer())) {
                throw new UnauthorizedAccessException("No puedes gestionar reservas de usuarios de otro grupo académico.");
            }
        }

        if (newStatus == ReservationStatus.CONFIRMADA) {
            checkAvailabilityOrThrow(reservation.getClassroom().getId(), reservation.getStartTime(), reservation.getEndTime(), reservation.getId());
        }
        reservation.setStatus(newStatus);
        return reservationRepository.save(reservation);
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
                if (reservation.getUser() != null && !CareerUtils.areSameCareerGroup(userCancelling.getCareer(), reservation.getUser().getCareer())) {
                    throw new UnauthorizedAccessException("No puedes cancelar reservas de otro grupo académico.");
                }
            } else if (!isOwner) {
                throw new UnauthorizedAccessException("No tienes permiso para cancelar esta reserva.");
            }
        }

        if (reservation.getStatus() == ReservationStatus.PENDIENTE || reservation.getStatus() == ReservationStatus.CONFIRMADA) {
            reservation.setStatus(ReservationStatus.CANCELADA);
            return reservationRepository.save(reservation);
        } else {
            throw new InvalidReservationException("Solo se pueden cancelar reservas PENDIENTES o CONFIRMADAS.");
        }
    }

    @Transactional
    public void deleteReservation(String id, UserDetails userDetails) {
        Reservation reservation = this.getReservationById(id);
        UserDetailsImpl userDetailsImpl = (UserDetailsImpl) userDetails;
        User userDeleting = userDetailsImpl.getUserEntity();

        boolean isAdmin = userDeleting.getRole() == Rol.ADMIN;
        boolean isOwner = reservation.getUser() != null && Objects.equals(reservation.getUser().getId(), userDeleting.getId());
        boolean isCoordinator = userDeleting.getRole() == Rol.COORDINADOR;

        if (isCoordinator && reservation.getUser() != null && !CareerUtils.areSameCareerGroup(userDeleting.getCareer(), reservation.getUser().getCareer())) {
            isCoordinator = false;
        }

        boolean allowedStatus = (reservation.getStatus() == ReservationStatus.PENDIENTE ||
                reservation.getStatus() == ReservationStatus.CANCELADA ||
                reservation.getStatus() == ReservationStatus.RECHAZADA);

        if (isAdmin || (isCoordinator && allowedStatus) || (isOwner && allowedStatus)) {
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