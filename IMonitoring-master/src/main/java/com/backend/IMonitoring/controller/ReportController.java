package com.backend.IMonitoring.controller;

import com.backend.IMonitoring.dto.*;
import com.backend.IMonitoring.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN', 'COORDINADOR')")
public class ReportController {

    private final ReportService reportService;

    @GetMapping("/resources")
    public ResponseEntity<List<ResourceReportDTO>> getResources(@RequestParam(value = "resource", defaultValue = "ALL") String resource) {
        return ResponseEntity.ok(reportService.getResourceReport(resource));
    }

    @GetMapping("/space-usage")
    public ResponseEntity<List<SpaceUsageDTO>> getSpaceUsage() {
        return ResponseEntity.ok(reportService.getSpaceUsageStatistics());
    }

    @GetMapping("/cancellations")
    public ResponseEntity<CancellationReportDTO> getCancellations() {
        return ResponseEntity.ok(reportService.getCancellationReport());
    }

    @GetMapping("/users")
    public ResponseEntity<UserReportDTO> getUserReport() {
        return ResponseEntity.ok(reportService.getDetailedUserReport());
    }
}