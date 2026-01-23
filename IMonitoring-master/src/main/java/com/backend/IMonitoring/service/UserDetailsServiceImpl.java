package com.backend.IMonitoring.service;

import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.repository.UserRepository;
import com.backend.IMonitoring.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {
    private final UserRepository userRepository;

    @Override
    @Transactional
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        // --- AGREGAR ESTO ---
        // Forzamos a Hibernate a leer el stream y guardar los bytes en memoria.
        // Si profilePicture es null, no hacemos nada.
        if (user.getProfilePicture() != null) {
            int size = user.getProfilePicture().length; // Simplemente "tocar" la propiedad fuerza la carga
        }
        // --------------------

        return new UserDetailsImpl(user);
    }
}