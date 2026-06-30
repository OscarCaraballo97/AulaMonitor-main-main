import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ReportsPage implements OnInit {

  resourceReport: any[] = [];
  spaceUsageReport: any[] = [];
  cancellationReport: any = null;
  statusDistribution: any = null;
  totalReservationsForStatus = 0;

  selectedFixedResource: string = 'ALL';
  fixedResourcesOptions: string[] = ['Proyector', 'Computadores', 'Sillas', 'Tablero Digital', 'Aire Acondicionado'];

  isLoadingResources = false;
  isLoadingUsage = false;
  isLoadingCancellations = false;
  isLoadingStatus = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadResourceReport();
    this.loadSpaceUsageReport();
    this.loadCancellationReport();
    this.loadStatusDistribution();
  }

  loadResourceReport() {
    this.isLoadingResources = true;
    this.http.get<any[]>(`${environment.apiUrl}/reports/resources?resource=${this.selectedFixedResource}`)
      .subscribe({
        next: (data) => { this.resourceReport = data; this.isLoadingResources = false; this.cdr.detectChanges(); },
        error: () => { this.isLoadingResources = false; }
      });
  }

  loadSpaceUsageReport() {
    this.isLoadingUsage = true;
    this.http.get<any[]>(`${environment.apiUrl}/reports/space-usage`)
      .subscribe({
        next: (data) => { this.spaceUsageReport = data; this.isLoadingUsage = false; this.cdr.detectChanges(); },
        error: () => { this.isLoadingUsage = false; }
      });
  }

  loadCancellationReport() {
    this.isLoadingCancellations = true;
    this.http.get<any>(`${environment.apiUrl}/reports/cancellations`)
      .subscribe({
        next: (data) => { this.cancellationReport = data; this.isLoadingCancellations = false; this.cdr.detectChanges(); },
        error: () => { this.isLoadingCancellations = false; }
      });
  }

  loadStatusDistribution() {
    this.isLoadingStatus = true;
    this.http.get<any>(`${environment.apiUrl}/reports/status-distribution`)
      .subscribe({
        next: (data) => {
          this.statusDistribution = data;
          this.totalReservationsForStatus = Object.values(data).reduce((acc: any, val: any) => acc + val, 0) as number;
          this.isLoadingStatus = false;
          this.cdr.detectChanges();
        },
        error: () => { this.isLoadingStatus = false; }
      });
  }

  getPercentage(value: number): number {
    if (!this.totalReservationsForStatus || !value) return 0;
    return (value / this.totalReservationsForStatus) * 100;
  }
}
