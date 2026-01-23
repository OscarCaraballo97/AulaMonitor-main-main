package com.backend.IMonitoring.config;

import com.backend.IMonitoring.model.Rol;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final AuthenticationProvider authenticationProvider;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        // Rutas públicas (Swagger, Auth, etc.)
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(
                                "/api/auth/**",
                                "/v3/api-docs/**",
                                "/swagger-ui/**",
                                "/swagger-resources/**",
                                "/webjars/**"
                        ).permitAll()

                        // --- BUILDINGS (Solo ADMIN) ---
                        .requestMatchers(HttpMethod.GET, "/api/buildings/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/buildings").hasAuthority("ROLE_" + Rol.ADMIN.name())
                        .requestMatchers(HttpMethod.PUT, "/api/buildings/**").hasAuthority("ROLE_" + Rol.ADMIN.name())
                        .requestMatchers(HttpMethod.DELETE, "/api/buildings/**").hasAuthority("ROLE_" + Rol.ADMIN.name())

                        // --- CLASSROOMS (Solo ADMIN, lectura todos) ---
                        .requestMatchers(HttpMethod.GET, "/api/classrooms/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/classrooms").hasAuthority("ROLE_" + Rol.ADMIN.name())
                        .requestMatchers(HttpMethod.PUT, "/api/classrooms/**").hasAuthority("ROLE_" + Rol.ADMIN.name())
                        .requestMatchers(HttpMethod.DELETE, "/api/classrooms/**").hasAuthority("ROLE_" + Rol.ADMIN.name())

                        // --- RESERVATIONS ---
                        // Crear reserva: Todos los roles autenticados pueden intentarlo (validado en servicio)
                        .requestMatchers(HttpMethod.POST, "/api/reservations").authenticated()

                        // Cambiar estado: ADMIN y COORDINADOR
                        .requestMatchers(HttpMethod.PUT, "/api/reservations/{id}/status").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())
                        .requestMatchers(HttpMethod.PATCH, "/api/reservations/{id}/status").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())

                        // Otras operaciones de reserva
                        .requestMatchers("/api/reservations/**").authenticated()

                        // --- USERS (CORRECCIÓN AQUÍ) ---
                        // PERMITIR A COORDINADORES CREAR USUARIOS (POST)
                        .requestMatchers(HttpMethod.POST, "/api/users").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())

                        // Listar usuarios: ADMIN y COORDINADOR
                        .requestMatchers(HttpMethod.GET, "/api/users/**").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())

                        // Editar usuarios: ADMIN y COORDINADOR
                        .requestMatchers(HttpMethod.PUT, "/api/users/**").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())

                        // Eliminar usuarios: ADMIN y COORDINADOR (validado en servicio)
                        .requestMatchers(HttpMethod.DELETE, "/api/users/**").hasAnyAuthority("ROLE_" + Rol.ADMIN.name(), "ROLE_" + Rol.COORDINADOR.name())

                        // Perfil propio
                        .requestMatchers("/api/users/me/**").authenticated()

                        .anyRequest().authenticated()
                )
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                .authenticationProvider(authenticationProvider)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.asList("http://localhost:8100", "http://localhost:4200"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}