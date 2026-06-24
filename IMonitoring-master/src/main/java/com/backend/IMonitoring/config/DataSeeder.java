package com.backend.IMonitoring.config;

import com.backend.IMonitoring.model.Rol;
import com.backend.IMonitoring.model.User;
import com.backend.IMonitoring.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class DataSeeder {

    @Bean
    CommandLineRunner initDatabase(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            if (userRepository.findByEmail("admin@admin.com").isEmpty()) {

                User admin = new User();
                admin.setName("Administrador General");
                admin.setEmail("admin@admin.com");
                admin.setPassword(passwordEncoder.encode("Admin123*"));
                admin.setRole(Rol.ADMIN);
                admin.setEnabled(true);

                userRepository.save(admin);

                System.out.println("=========================================");
                System.out.println("✅ ADMINISTRADOR CREADO CON ÉXITO");
                System.out.println("📧 Correo: pruebascorreostokens@gmail.com");
                System.out.println("🔑 Clave: Admin123*");
                System.out.println("=========================================");
            }
        };
    }
}