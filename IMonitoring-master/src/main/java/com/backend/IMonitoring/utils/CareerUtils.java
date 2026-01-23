package com.backend.IMonitoring.utils;

import java.util.HashMap;
import java.util.Map;

public class CareerUtils {

    private static final Map<String, String> CAREER_GROUPS = new HashMap<>();

    static {
        // GRUPO SISTEMAS
        String sistemasGroup = "SISTEMAS";
        CAREER_GROUPS.put("Ingeniería de Sistemas", sistemasGroup);
        CAREER_GROUPS.put("Tecnología en Desarrollo de Sistemas de Información y de Software", sistemasGroup);

        // GRUPO INDUSTRIAL / CALIDAD
        String industrialGroup = "INDUSTRIAL";
        CAREER_GROUPS.put("Ingeniería Industrial", industrialGroup);
        CAREER_GROUPS.put("Tecnología en Sistemas de Gestión de Calidad", industrialGroup);

        // GRUPO TURISMO
        String turismoGroup = "TURISMO";
        CAREER_GROUPS.put("Administración de Empresas Turísticas y Hoteleras", turismoGroup);
        CAREER_GROUPS.put("Tecnología en Gestión de Servicios Turísticos y Hoteleros", turismoGroup);
    }

    public static boolean areSameCareerGroup(String career1, String career2) {
        if (career1 == null || career2 == null) return false;
        if (career1.equalsIgnoreCase(career2)) return true;
        String group1 = CAREER_GROUPS.get(career1);
        String group2 = CAREER_GROUPS.get(career2);
        return group1 != null && group1.equals(group2);
    }
}