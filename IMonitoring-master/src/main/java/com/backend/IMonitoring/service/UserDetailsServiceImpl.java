package com.backend.IMonitoring.service; // O el paquete donde lo tengas (ej: security)

import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.repository.UserRepository;
import com.backend.IMonitoring.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional; // <--- IMPORTANTE

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {
    private final UserRepository userRepository;

    @Override
    @Transactional // <--- ESTA LÍNEA SOLUCIONA EL ERROR "Unable to access lob stream"
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        // Al estar dentro de @Transactional, aquí se pueden leer los bytes de la imagen
        // antes de devolver el objeto UserDetailsImpl.
        return new UserDetailsImpl(user);
    }
}