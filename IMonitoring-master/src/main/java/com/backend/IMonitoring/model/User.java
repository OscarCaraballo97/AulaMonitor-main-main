package com.backend.IMonitoring.model;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import lombok.*;

import java.util.List;

@Entity
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Rol role;

    @Column(name = "career")
    private String career;
    private String avatarUrl;

    @Column(name = "profile_picture", length = 1000000)
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    private byte[] profilePicture;

    @Column(name = "image_type")
    private String imageType;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = false;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @ToString.Exclude
    @EqualsAndHashCode.Exclude
    @JsonManagedReference("user-reservations")
    private List<Reservation> reservations;
}