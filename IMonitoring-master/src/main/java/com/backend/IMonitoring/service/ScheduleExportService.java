package com.backend.IMonitoring.service;

import com.backend.IMonitoring.model.Reservation;
import com.backend.IMonitoring.model.Classroom;
import com.backend.IMonitoring.repository.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ScheduleExportService {

    private final ReservationRepository reservationRepository;

    public byte[] exportScheduleAsExcel(String institution, String format) throws IOException {
        List<Reservation> allDatabaseReservations = reservationRepository.findAll();

        List<Classroom> allClassrooms = allDatabaseReservations.stream()
                .map(Reservation::getClassroom)
                .filter(Objects::nonNull)
                .distinct()
                .sorted(Comparator.comparing(Classroom::getName))
                .collect(Collectors.toList());

        LocalDateTime startOfToday = LocalDate.now().atStartOfDay();
        List<Reservation> activeReservations = allDatabaseReservations.stream()
                .filter(r -> r.getStartTime() != null && !r.getStartTime().isBefore(startOfToday))
                .collect(Collectors.toList());

        // --- FILTRO MEJORADO (Soporta múltiples instituciones y lee la de la reserva) ---
        if (institution != null && !institution.equalsIgnoreCase("AMBAS")) {
            activeReservations = activeReservations.stream()
                    .filter(r -> {
                        // 1. Prioriza la institución guardada directamente en la reserva
                        if (r.getInstitution() != null && !r.getInstitution().isEmpty()) {
                            return r.getInstitution().toLowerCase().contains(institution.toLowerCase());
                        }
                        // 2. Si es antigua y no tiene, busca en el usuario (soporta "Colombo, Unicolombo")
                        if (r.getUser() != null && r.getUser().getInstitution() != null) {
                            return r.getUser().getInstitution().toLowerCase().contains(institution.toLowerCase());
                        }
                        return false;
                    })
                    .collect(Collectors.toList());
        }

        try (Workbook workbook = new XSSFWorkbook()) {
            if ("CUADRICULA".equalsIgnoreCase(format)) {
                buildSemesterGridSheet(workbook, activeReservations, allClassrooms, institution);
            } else if ("PLANTILLA".equalsIgnoreCase(format)) {
                buildWeeklyTemplateSheet(workbook, activeReservations, allClassrooms, institution);
            } else {
                buildAlmanacSheet(workbook, activeReservations, institution);
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            return outputStream.toByteArray();
        }
    }

    private String getEffectiveInstitution(Reservation res) {
        if (res.getInstitution() != null && !res.getInstitution().isEmpty()) return res.getInstitution();
        if (res.getUser() != null && res.getUser().getInstitution() != null) return res.getUser().getInstitution();
        return "Sin Inst.";
    }

    // --- ALMANAQUE MENSUAL ---
    private void buildAlmanacSheet(Workbook workbook, List<Reservation> reservations, String institution) {
        LocalDate today = LocalDate.now();
        for (int i = 0; i < 3; i++) {
            YearMonth yearMonth = YearMonth.from(today.plusMonths(i));
            String monthName = yearMonth.getMonth().getDisplayName(TextStyle.FULL, new Locale("es", "ES"));
            monthName = monthName.substring(0, 1).toUpperCase() + monthName.substring(1) + " " + yearMonth.getYear();

            if (!institution.equals("AMBAS")) {
                monthName += " (" + institution.substring(0, Math.min(3, institution.length())) + ")";
            }

            Sheet sheet = workbook.createSheet(monthName);

            CellStyle headerStyle = workbook.createCellStyle();
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);
            Font headerFont = workbook.createFont();
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            CellStyle dayStyle = workbook.createCellStyle();
            dayStyle.setWrapText(true);
            dayStyle.setVerticalAlignment(VerticalAlignment.TOP);

            Row headerRow = sheet.createRow(0);
            headerRow.setHeightInPoints(25);
            String[] daysOfWeek = {"Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"};
            for (int col = 0; col < 7; col++) {
                Cell c = headerRow.createCell(col);
                c.setCellValue(daysOfWeek[col]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(col, 10000);
            }

            int currentRow = 1;
            Row weekRow = sheet.createRow(currentRow);
            int currentMaxLines = 3;

            for (int day = 1; day <= yearMonth.lengthOfMonth(); day++) {
                LocalDate currentDate = yearMonth.atDay(day);
                int col = currentDate.getDayOfWeek().getValue() - 1;

                if (col == 0 && day != 1) {
                    weekRow.setHeightInPoints(Math.max(70, currentMaxLines * 12));
                    currentRow++;
                    weekRow = sheet.createRow(currentRow);
                    currentMaxLines = 3;
                }

                Cell cell = weekRow.createCell(col);

                List<Reservation> dayRes = reservations.stream()
                        .filter(r -> r.getStartTime().toLocalDate().equals(currentDate))
                        .filter(r -> r.getStatus().name().equals("CONFIRMADA"))
                        .sorted(Comparator.comparing(Reservation::getStartTime))
                        .collect(Collectors.toList());

                StringBuilder cellText = new StringBuilder();
                cellText.append("🗓️ DÍA ").append(day).append("\n");

                if (!dayRes.isEmpty()) {
                    cellText.append("----------------\n");
                    for (Reservation res : dayRes) {
                        String time = res.getStartTime().format(DateTimeFormatter.ofPattern("HH:mm")) + "-" + res.getEndTime().format(DateTimeFormatter.ofPattern("HH:mm"));
                        String room = res.getClassroom() != null ? res.getClassroom().getName() : "?";
                        String user = res.getUser() != null ? res.getUser().getName() : "Desc.";
                        String inst = getEffectiveInstitution(res);

                        cellText.append(String.format("• %s | %s\n  %s (%s)\n", time, room, user, inst));
                    }
                    int lines = dayRes.size() * 2 + 3;
                    if (lines > currentMaxLines) currentMaxLines = lines;
                }

                cell.setCellValue(cellText.toString().trim());
                cell.setCellStyle(dayStyle);
            }
            weekRow.setHeightInPoints(Math.max(70, currentMaxLines * 12));
        }
    }

    // --- HORARIO FIJO SEMANAL (CLASES RECURRENTES) ---
    private void buildWeeklyTemplateSheet(Workbook workbook, List<Reservation> reservations, List<Classroom> classrooms, String institution) {
        String sheetName = "Horario Base Fijo";
        Sheet sheet = workbook.createSheet(sheetName);

        CellStyle titleStyle = workbook.createCellStyle();
        Font titleFont = workbook.createFont();
        titleFont.setBold(true);
        titleFont.setFontHeightInPoints((short) 14);
        titleStyle.setFont(titleFont);
        titleStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        titleStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

        CellStyle headerStyle = workbook.createCellStyle();
        headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setAlignment(HorizontalAlignment.CENTER);
        Font headerFont = workbook.createFont();
        headerFont.setColor(IndexedColors.WHITE.getIndex());
        headerFont.setBold(true);
        headerStyle.setFont(headerFont);

        CellStyle wrapStyle = workbook.createCellStyle();
        wrapStyle.setWrapText(true);
        wrapStyle.setVerticalAlignment(VerticalAlignment.TOP);
        wrapStyle.setAlignment(HorizontalAlignment.CENTER);

        int currentRow = 0;
        String[] days = {"Hora", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"};

        for (Classroom classroom : classrooms) {
            Row titleRow = sheet.createRow(currentRow++);
            Cell titleCell = titleRow.createCell(0);
            titleCell.setCellValue("AULA: " + classroom.getName().toUpperCase());
            titleCell.setCellStyle(titleStyle);

            Row headerRow = sheet.createRow(currentRow++);
            for (int i = 0; i < days.length; i++) {
                Cell c = headerRow.createCell(i);
                c.setCellValue(days[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, i == 0 ? 4000 : 6500);
            }

            for (int h = 6; h < 22; h++) {
                Row row = sheet.createRow(currentRow++);
                row.createCell(0).setCellValue(String.format("%02d:00 - %02d:45", h, h));
                row.getCell(0).setCellStyle(wrapStyle);
                row.setHeightInPoints(40);

                for (int d = 1; d <= 6; d++) {
                    final int targetDay = d;
                    final int targetHour = h;

                    List<Reservation> matching = reservations.stream()
                            .filter(r -> r.getClassroom() != null && r.getClassroom().getId().equals(classroom.getId()))
                            .filter(r -> r.getStartTime().getDayOfWeek().getValue() == targetDay)
                            .filter(r -> {
                                int startTotalMins = r.getStartTime().getHour() * 60 + r.getStartTime().getMinute();
                                int endTotalMins = r.getEndTime().getHour() * 60 + r.getEndTime().getMinute();
                                int cellStartMins = targetHour * 60;
                                int cellEndMins = cellStartMins + 45;
                                return startTotalMins < cellEndMins && endTotalMins > cellStartMins;
                            })
                            .filter(r -> r.getStatus().name().equals("CONFIRMADA"))
                            .collect(Collectors.toList());

                    if (!matching.isEmpty()) {
                        Reservation dominant = findMostFrequent(matching);
                        String inst = getEffectiveInstitution(dominant);
                        String userName = dominant.getUser() != null ? dominant.getUser().getName() : "Desconocido";
                        String purpose = dominant.getPurpose() != null ? dominant.getPurpose() : "Clase";

                        Cell c = row.createCell(d);
                        c.setCellValue(String.format("%s\n%s (%s)", purpose, userName, inst));
                        c.setCellStyle(wrapStyle);
                    }
                }
            }
            currentRow += 2;
        }
    }

    private Reservation findMostFrequent(List<Reservation> list) {
        return list.stream()
                .collect(Collectors.groupingBy(r -> r.getPurpose() + "_" + (r.getUser()!=null?r.getUser().getName():""), Collectors.counting()))
                .entrySet().stream().max(Map.Entry.comparingByValue())
                .flatMap(e -> list.stream().filter(r -> (r.getPurpose() + "_" + (r.getUser()!=null?r.getUser().getName():"")).equals(e.getKey())).findFirst())
                .orElse(list.get(0));
    }


    // --- MATRIZ SEMESTRAL ---
    private void buildSemesterGridSheet(Workbook workbook, List<Reservation> reservations, List<Classroom> classrooms, String institution) {
        String sheetName = "Matriz Semestral (" + (institution.equals("AMBAS") ? "General" : institution) + ")";
        Sheet sheet = workbook.createSheet(sheetName);

        CellStyle headerStyle = workbook.createCellStyle();
        headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);
        headerStyle.setAlignment(HorizontalAlignment.CENTER);
        Font headerFont = workbook.createFont();
        headerFont.setBold(true);
        headerFont.setColor(IndexedColors.WHITE.getIndex());
        headerStyle.setFont(headerFont);

        CellStyle dateStyle = workbook.createCellStyle();
        dateStyle.setVerticalAlignment(VerticalAlignment.TOP);
        Font boldFont = workbook.createFont();
        boldFont.setBold(true);
        dateStyle.setFont(boldFont);

        CellStyle wrapStyle = workbook.createCellStyle();
        wrapStyle.setWrapText(true);
        wrapStyle.setVerticalAlignment(VerticalAlignment.TOP);

        CellStyle freeStyle = workbook.createCellStyle();
        freeStyle.setVerticalAlignment(VerticalAlignment.TOP);
        freeStyle.setAlignment(HorizontalAlignment.CENTER);
        Font greenFont = workbook.createFont();
        greenFont.setColor(IndexedColors.SEA_GREEN.getIndex());
        greenFont.setBold(true);
        freeStyle.setFont(greenFont);

        Row headerRow = sheet.createRow(0);
        headerRow.setHeightInPoints(30);

        Cell cellFecha = headerRow.createCell(0);
        cellFecha.setCellValue("Fecha");
        cellFecha.setCellStyle(headerStyle);
        sheet.setColumnWidth(0, 3500);

        Cell cellDia = headerRow.createCell(1);
        cellDia.setCellValue("Día");
        cellDia.setCellStyle(headerStyle);
        sheet.setColumnWidth(1, 3500);

        for (int i = 0; i < classrooms.size(); i++) {
            Cell cell = headerRow.createCell(i + 2);
            cell.setCellValue(classrooms.get(i).getName());
            cell.setCellStyle(headerStyle);
            sheet.setColumnWidth(i + 2, 8500);
        }

        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusMonths(5);

        Optional<LocalDateTime> maxResDate = reservations.stream()
                .map(Reservation::getStartTime)
                .max(LocalDateTime::compareTo);
        if (maxResDate.isPresent() && maxResDate.get().toLocalDate().isAfter(endDate)) {
            endDate = maxResDate.get().toLocalDate();
        }

        int rowIdx = 1;
        DateTimeFormatter dateFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm");

        for (LocalDate date = today; !date.isAfter(endDate); date = date.plusDays(1)) {
            if (date.getDayOfWeek().getValue() == 7) continue;

            Row row = sheet.createRow(rowIdx++);

            Cell dateCell = row.createCell(0);
            dateCell.setCellValue(date.format(dateFormatter));
            dateCell.setCellStyle(dateStyle);

            Cell dayCell = row.createCell(1);
            String dayName = date.getDayOfWeek().getDisplayName(TextStyle.FULL, new Locale("es", "ES"));
            dayName = dayName.substring(0, 1).toUpperCase() + dayName.substring(1);
            dayCell.setCellValue(dayName);
            dayCell.setCellStyle(dateStyle);

            int maxLinesInRow = 1;
            final LocalDate currentDate = date;

            for (int i = 0; i < classrooms.size(); i++) {
                Classroom currentRoom = classrooms.get(i);
                Cell roomCell = row.createCell(i + 2);

                List<Reservation> dayReservations = reservations.stream()
                        .filter(r -> r.getClassroom() != null
                                && r.getClassroom().getId().equals(currentRoom.getId())
                                && r.getStartTime().toLocalDate().equals(currentDate)
                                && r.getStatus().name().equals("CONFIRMADA"))
                        .sorted(Comparator.comparing(Reservation::getStartTime))
                        .collect(Collectors.toList());

                if (dayReservations.isEmpty()) {
                    if (institution.equalsIgnoreCase("AMBAS")) {
                        roomCell.setCellValue("Libre");
                    } else {
                        roomCell.setCellValue("Sin reservas");
                    }
                    roomCell.setCellStyle(freeStyle);
                } else {
                    StringBuilder cellText = new StringBuilder();
                    for (Reservation res : dayReservations) {
                        String userInst = getEffectiveInstitution(res);
                        String userName = res.getUser() != null ? res.getUser().getName() : "Desconocido";
                        String purpose = res.getPurpose() != null ? res.getPurpose() : "Sin motivo";
                        String timeRange = res.getStartTime().format(timeFormatter) + " - " + res.getEndTime().format(timeFormatter);

                        cellText.append(String.format("🕒 %s\n👤 %s (%s)\n📝 %s\n\n", timeRange, userName, userInst, purpose));
                    }

                    roomCell.setCellValue(cellText.toString().trim());
                    roomCell.setCellStyle(wrapStyle);

                    int lines = dayReservations.size() * 4;
                    if (lines > maxLinesInRow) {
                        maxLinesInRow = lines;
                    }
                }
            }
            row.setHeightInPoints(Math.max(25, maxLinesInRow * 15));
        }
    }
}