package com.backend.IMonitoring.service;

import com.backend.IMonitoring.dto.UserDTO;
import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.model.Rol;
import com.backend.IMonitoring.repository.UserRepository;
import com.backend.IMonitoring.repository.ReservationRepository;
import com.backend.IMonitoring.model.Reservation;
import com.backend.IMonitoring.exceptions.UnauthorizedAccessException;
import com.backend.IMonitoring.exceptions.ResourceNotFoundException;
import com.backend.IMonitoring.exceptions.UserAlreadyExistsException;
import com.backend.IMonitoring.exceptions.InvalidCredentialsException;
import com.backend.IMonitoring.utils.CareerUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import com.backend.IMonitoring.security.UserDetailsImpl;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ReservationRepository reservationRepository;

    public List<User> getAllUsers() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "name"));
    }

    public User getUserById(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado con ID: " + id));
    }

    public Optional<User> findByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    public List<User> getUsersByRole(Rol role) {
        return userRepository.findByRole(role, Sort.by(Sort.Direction.ASC, "name"));
    }

    @Transactional
    public User createUser(UserDTO userDTO, User performingUser) {
        // --- VALIDACIÓN DE PERMISOS Y CARRERA ---

        if (performingUser.getRole() == Rol.COORDINADOR) {
            // 1. Validar Rol permitido
            if (userDTO.getRole() != Rol.ESTUDIANTE && userDTO.getRole() != Rol.PROFESOR) {
                throw new UnauthorizedAccessException("Los Coordinadores solo pueden crear cuentas de Estudiante o Profesor.");
            }

            // 2. Validar que el Coordinador tenga carrera
            if (performingUser.getCareer() == null) {
                throw new UnauthorizedAccessException("Tu cuenta de Coordinador no tiene una carrera asignada.");
            }

            // 3. VALIDACIÓN ESTRICTA DE GRUPO ACADÉMICO
            // El usuario que se crea DEBE pertenecer al mismo grupo académico que el coordinador.
            // Si userDTO.getCareer() viene vacío, se asigna la del coordinador.
            // Si viene lleno, se verifica que sea compatible.
            if (userDTO.getCareer() == null || userDTO.getCareer().isEmpty()) {
                userDTO.setCareer(performingUser.getCareer());
            } else {
                if (!CareerUtils.areSameCareerGroup(performingUser.getCareer(), userDTO.getCareer())) {
                    throw new UnauthorizedAccessException("No puedes asignar la carrera '" + userDTO.getCareer() + "' porque no pertenece a tu grupo académico.");
                }
            }
        }
        else if (performingUser.getRole() == Rol.ADMIN) {
            // Admin puede crear todo, pero validamos consistencia básica
            if (userDTO.getRole() == Rol.COORDINADOR && (userDTO.getCareer() == null || userDTO.getCareer().isEmpty())) {
                throw new IllegalArgumentException("Al crear un Coordinador, debes asignarle una carrera.");
            }
        }
        else {
            throw new UnauthorizedAccessException("No tienes permiso para crear usuarios.");
        }

        User user = userDTO.toEntity();
        user.setCareer(userDTO.getCareer()); // Asegurar persistencia

        return createUserEntityLogic(user, performingUser);
    }

    @Transactional
    protected User createUserEntityLogic(User user, User performingUser) {
        if (userRepository.findByEmail(user.getEmail()).isPresent()) {
            throw new UserAlreadyExistsException("El correo electrónico '" + user.getEmail() + "' ya está registrado.");
        }

        if (user.getPassword() == null || user.getPassword().isEmpty()) {
            throw new IllegalArgumentException("La contraseña es obligatoria para crear un nuevo usuario.");
        }

        if (!user.getPassword().startsWith("$2a$")) {
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        }

        user.setEnabled(true);

        return userRepository.save(user);
    }

    @Transactional
    public User updateUser(String id, UserDTO userDTO, User performingUser) {
        User existingUser = getUserById(id);

        boolean isPerformingAdmin = performingUser.getRole() == Rol.ADMIN;
        boolean isPerformingCoordinator = performingUser.getRole() == Rol.COORDINADOR;
        boolean isSelf = existingUser.getId().equals(performingUser.getId());

        if (!isPerformingAdmin && !isSelf && !isPerformingCoordinator) {
            throw new UnauthorizedAccessException("No tienes permiso para actualizar este usuario.");
        }

        // VALIDACIÓN COORDINADOR AL EDITAR
        if (isPerformingCoordinator && !isSelf) {
            // Solo puede editar gente de su grupo
            if (!CareerUtils.areSameCareerGroup(performingUser.getCareer(), existingUser.getCareer())) {
                throw new UnauthorizedAccessException("No puedes gestionar usuarios de otro grupo académico.");
            }
            // Solo estudiantes o profesores
            if (existingUser.getRole() != Rol.ESTUDIANTE && existingUser.getRole() != Rol.PROFESOR) {
                throw new UnauthorizedAccessException("Solo puedes gestionar Estudiantes o Profesores.");
            }

            // Si intenta cambiar la carrera del usuario, validar que la nueva carrera siga siendo del grupo
            if (userDTO.getCareer() != null && !userDTO.getCareer().equals(existingUser.getCareer())) {
                if (!CareerUtils.areSameCareerGroup(performingUser.getCareer(), userDTO.getCareer())) {
                    throw new UnauthorizedAccessException("No puedes cambiar al usuario a una carrera fuera de tu grupo.");
                }
            }
        }

        boolean hasPermission = isSelf || isPerformingAdmin || isPerformingCoordinator;

        if (userDTO.getName() != null && hasPermission) {
            existingUser.setName(userDTO.getName());
        }

        if (userDTO.getEmail() != null && !existingUser.getEmail().equalsIgnoreCase(userDTO.getEmail()) && hasPermission) {
            Optional<User> userWithNewEmail = userRepository.findByEmail(userDTO.getEmail());
            if (userWithNewEmail.isPresent() && !userWithNewEmail.get().getId().equals(existingUser.getId())) {
                throw new UserAlreadyExistsException("El nuevo correo electrónico ya está en uso.");
            }
            existingUser.setEmail(userDTO.getEmail());
        }

        if (userDTO.getCareer() != null && hasPermission) {
            existingUser.setCareer(userDTO.getCareer());
        }

        if (userDTO.getAvatarUrl() != null && hasPermission) {
            existingUser.setAvatarUrl(userDTO.getAvatarUrl().isEmpty() ? null : userDTO.getAvatarUrl());
        }

        if (userDTO.getRole() != null && userDTO.getRole() != existingUser.getRole()) {
            if (isPerformingAdmin) {
                if (isSelf && userDTO.getRole() != Rol.ADMIN) {
                    throw new UnauthorizedAccessException("Un administrador no puede quitarse su propio rol de admin.");
                }
                existingUser.setRole(userDTO.getRole());
            } else {
                throw new UnauthorizedAccessException("No tienes permiso para cambiar el rol.");
            }
        }

        if (userDTO.getEnabled() != null && existingUser.isEnabled() != userDTO.getEnabled()) {
            if (isPerformingAdmin || (isPerformingCoordinator && !isSelf)) {
                existingUser.setEnabled(userDTO.getEnabled());
            } else if (isSelf) {
                throw new UnauthorizedAccessException("No puedes deshabilitar tu propia cuenta.");
            } else {
                throw new UnauthorizedAccessException("No tienes permiso para cambiar el estado.");
            }
        }

        return userRepository.save(existingUser);
    }

    @Transactional
    public User uploadUserProfilePicture(String userId, MultipartFile file, User performingUser) throws IOException {
        User userToUpdate = getUserById(userId);

        boolean isAdmin = performingUser.getRole() == Rol.ADMIN;
        boolean isCoordinator = performingUser.getRole() == Rol.COORDINADOR;
        boolean isSelf = userToUpdate.getId().equals(performingUser.getId());

        if (!isSelf && !isAdmin) {
            if (isCoordinator) {
                if (userToUpdate.getRole() != Rol.ESTUDIANTE && userToUpdate.getRole() != Rol.PROFESOR) {
                    throw new UnauthorizedAccessException("No tienes permiso para cambiar la foto de este usuario.");
                }
                if (!CareerUtils.areSameCareerGroup(performingUser.getCareer(), userToUpdate.getCareer())) {
                    throw new UnauthorizedAccessException("Usuario de otra carrera.");
                }
            } else {
                throw new UnauthorizedAccessException("No tienes permiso para cambiar la foto de este usuario.");
            }
        }

        if (file.getContentType() == null || !file.getContentType().startsWith("image/")) {
            throw new IllegalArgumentException("El archivo debe ser una imagen.");
        }

        userToUpdate.setProfilePicture(file.getBytes());
        userToUpdate.setImageType(file.getContentType());

        return userRepository.save(userToUpdate);
    }

    @Transactional
    public void updateUserPassword(String userId, String currentPassword, String newPassword, User performingUser) {
        User userToUpdate = getUserById(userId);
        boolean isAdmin = performingUser.getRole() == Rol.ADMIN;
        boolean isSelf = userToUpdate.getId().equals(performingUser.getId());

        if (!isSelf && !isAdmin) {
            throw new UnauthorizedAccessException("No tienes permiso para cambiar la contraseña de este usuario.");
        }

        if (isSelf) {
            if (currentPassword == null || currentPassword.isEmpty()){
                throw new IllegalArgumentException("La contraseña actual es requerida.");
            }
            if(!passwordEncoder.matches(currentPassword, userToUpdate.getPassword())) {
                throw new InvalidCredentialsException("La contraseña actual es incorrecta.");
            }
        }

        userToUpdate.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(userToUpdate);
    }

    @Transactional
    public void deleteUser(String id, User performingUser) {
        User userToDelete = getUserById(id);

        boolean isAdmin = performingUser.getRole() == Rol.ADMIN;
        boolean isCoordinator = performingUser.getRole() == Rol.COORDINADOR;

        if (isAdmin) {
            if (userToDelete.getId().equals(performingUser.getId())) {
                throw new UnauthorizedAccessException("No puedes eliminarte a ti mismo.");
            }
        } else if (isCoordinator) {
            if (userToDelete.getRole() != Rol.ESTUDIANTE && userToDelete.getRole() != Rol.PROFESOR) {
                throw new UnauthorizedAccessException("No tienes permiso para eliminar usuarios con rol: " + userToDelete.getRole());
            }
            if (!CareerUtils.areSameCareerGroup(performingUser.getCareer(), userToDelete.getCareer())) {
                throw new UnauthorizedAccessException("No puedes eliminar usuarios de otra carrera.");
            }
            if (userToDelete.getId().equals(performingUser.getId())) {
                throw new UnauthorizedAccessException("No puedes eliminarte a ti mismo.");
            }
        } else {
            throw new UnauthorizedAccessException("No tienes permiso para eliminar este usuario.");
        }

        List<Reservation> userReservations = reservationRepository.findByUserId(id, Sort.unsorted());
        if (userReservations != null && !userReservations.isEmpty()) {
            reservationRepository.deleteAll(userReservations);
        }
        userRepository.delete(userToDelete);
    }

    public List<Reservation> getReservationsByUserId(String userId) {
        getUserById(userId);
        return reservationRepository.findByUserId(userId, Sort.by(Sort.Direction.DESC, "startTime"));
    }

    public User getCurrentAuthenticatedUser() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof UserDetailsImpl) {
            return ((UserDetailsImpl) principal).getUserEntity();
        } else if (principal instanceof String && "anonymousUser".equals(principal)) {
            throw new UnauthorizedAccessException("Usuario no autenticado.");
        }
        throw new IllegalStateException("Principal no válido.");
    }
}