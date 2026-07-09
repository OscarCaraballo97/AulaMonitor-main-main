import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { IonicModule } from '@ionic/angular';
import Chart from 'chart.js/auto'; // <-- Importación para el gráfico

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
  isLoadingChart = false; // <-- Nuevo indicador de carga

  // Referencia al lienzo del gráfico en el HTML
  @ViewChild('institutionChart') institutionChartCanvas!: ElementRef;
  chartInstance: any;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadResourceReport();
    this.loadSpaceUsageReport();
    this.loadCancellationReport();
    this.loadStatusDistribution();
    // La carga del gráfico la llamaremos más adelante para asegurar que la vista esté lista
  }

  // ionViewDidEnter asegura que el HTML ya se dibujó antes de intentar crear el gráfico
  ionViewDidEnter() {
      this.loadInstitutionComparison();
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

  // --- LÓGICA DEL GRÁFICO ---
  loadInstitutionComparison() {
    this.isLoadingChart = true;
    // Llamamos a tu endpoint general de reservas para extraer la data
    this.http.get<any[]>(`${environment.apiUrl}/reservations`).subscribe({
      next: (reservations) => {
        this.generateChart(reservations);
        this.isLoadingChart = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
          console.error('Error cargando datos para el gráfico', err);
          this.isLoadingChart = false;
      }
    });
  }

  generateChart(reservations: any[]) {
    // 1. Filtramos solo las reservas válidas
    const validRes = reservations.filter(r => r.status === 'CONFIRMADA' && r.classroom && r.user);

    // 2. Agrupamos los datos: { "Aula 101": { colombo: 5, unicolombo: 10 } }
    const usageMap = new Map<string, { colombo: number, unicolombo: number }>();
    let totalColombo = 0;
    let totalUnicolombo = 0;

    validRes.forEach(r => {
      const roomName = r.classroom.name;
      const inst = r.user.institution?.toLowerCase() || 'otro';

      if (!usageMap.has(roomName)) {
        usageMap.set(roomName, { colombo: 0, unicolombo: 0 });
      }

      const counts = usageMap.get(roomName)!;
      if (inst === 'colombo') {
        counts.colombo++;
        totalColombo++;
      } else if (inst === 'unicolombo') {
        counts.unicolombo++;
        totalUnicolombo++;
      }
    });

    // 3. Preparamos los arreglos para Chart.js
    const labels = Array.from(usageMap.keys()).sort();
    const colomboData = labels.map(label => usageMap.get(label)!.colombo);
    const unicolomboData = labels.map(label => usageMap.get(label)!.unicolombo);

    // Destruir instancia anterior si existe
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    // 4. Dibujamos el gráfico
    if (this.institutionChartCanvas && this.institutionChartCanvas.nativeElement) {
      this.chartInstance = new Chart(this.institutionChartCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: `Colombo (Total: ${totalColombo})`,
              data: colomboData,
              backgroundColor: '#3b82f6', // Azul para Colombo
              borderRadius: 4,
              borderWidth: 1
            },
            {
              label: `Unicolombo (Total: ${totalUnicolombo})`,
              data: unicolomboData,
              backgroundColor: '#f97316', // Naranja para Unicolombo
              borderRadius: 4,
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            title: {
              display: true,
              text: 'Comparativa de Uso de Espacios: Colombo vs Unicolombo',
              font: { size: 16 }
            },
            tooltip: {
              callbacks: {
                label: (context) => ` ${context.dataset.label}: ${context.raw} reservas`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
              title: { display: true, text: 'Cantidad de Reservas' }
            },
            x: {
              title: { display: true, text: 'Aulas / Espacios' }
            }
          }
        }
      });
    }
  }
}
