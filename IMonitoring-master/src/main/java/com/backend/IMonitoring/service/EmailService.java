package com.backend.IMonitoring.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    @Async
    public void sendVerificationEmail(String to, String token) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setTo(to);
            helper.setSubject("Verifica tu correo electrónico para IMonitoring");
            helper.setFrom("no-reply@imonitoring.com");

            String verificationLink = "http://localhost:8100/verify-email?token=" + token;

            String htmlContent = "<html>" +
                                 "<body style='font-family: Arial, sans-serif; color: #333;'>" +
                                 "<h2 style='color: #0056b3;'>Hola,</h2>" +
                                 "<p>¡Gracias por registrarte en IMonitoring!.</p>" +
                                 "<p>Por favor, haz clic en el siguiente botón para verificar tu correo electrónico y activar tu cuenta:</p>" +
                                 "<p style='text-align: center;'>" +
                                 "<a href='" + verificationLink + "' " +
                                 "style='background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;'>" +
                                 "Verificar mi correo electrónico" +
                                 "</a>" +
                                 "</p>" +
                                 "<p>Si no te registraste, por favor ignora este correo.</p>" +
                                 "<p>Saludos,<br/>El equipo de IMonitoring</p>" +
                                 "</body>" +
                                 "</html>";

            helper.setText(htmlContent, true);

            mailSender.send(message);
        } catch (MessagingException e) {
            System.err.println("Error al enviar correo de verificación a " + to + ": " + e.getMessage());
            throw new IllegalStateException("Failed to send verification email", e);
        }
    }
}