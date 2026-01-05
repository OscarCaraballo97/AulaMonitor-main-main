package com.backend.IMonitoring.dto;

import com.backend.IMonitoring.model.Rol;
import com.backend.IMonitoring.model.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {

    private String id;

    @NotBlank(message = "El nombre es obligatorio")
    @Size(min = 3, max = 100, message = "El nombre debe tener entre 3 y 100 caracteres")
    private String name;

    @NotBlank(message = "El correo electrónico es obligatorio")
    @Email(message = "El formato del correo electrónico no es válido")
    @Size(max = 100, message = "El correo electrónico no debe exceder los 100 caracteres")
    private String email;

    @NotNull(message = "El rol es obligatorio")
    private Rol role;

    private String password;

    private String avatarUrl;

    @Builder.Default
    private boolean enabled = true;

    public static UserDTO fromEntity(User user) {
        if (user == null) {
            return null;
        }
        return UserDTO.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole())
                .avatarUrl(user.getAvatarUrl())
                .enabled(user.isEnabled())
                .build();
    }

    public User toEntity() {
        User user = new User();
        user.setId(this.id); 
        user.setName(this.name);
        user.setEmail(this.email);
        user.setRole(this.role);
        user.setAvatarUrl(this.avatarUrl);
        user.setEnabled(this.enabled);
        if (this.password != null && !this.password.isEmpty()) {
            user.setPassword(this.password); 
        }
        return user;
    }
}