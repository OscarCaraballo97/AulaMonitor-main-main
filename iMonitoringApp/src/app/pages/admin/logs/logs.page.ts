import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { PdfService } from '../../../services/pdf.service';

import {
  IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonMenuButton,
  IonIcon, IonSpinner
} from '@ionic/angular/standalone';

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  performedBy: string;
  details: string;
}

@Component({
  selector: 'app-logs',
  templateUrl: './logs.page.html',
  styleUrls: ['./logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonMenuButton,
    IonIcon, IonSpinner
  ],
  providers: [DatePipe]
})
export class LogsPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  allLogs: AuditLog[] = [];
  filteredLogs: AuditLog[] = [];

  selectedDate: string = '';
  searchTerm: string = '';
  selectedAction: string = 'ALL';

  actionTypes: string[] = [];

  isLoading = true;

  constructor(
    private http: HttpClient,
    private pdfService: PdfService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadLogs();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLogs() {
    this.isLoading = true;

    this.http.get<any>(`${environment.apiUrl}/audit-logs`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          const list = Array.isArray(data) ? data : (data?.content || data?.data || []);

          this.allLogs = list.map((log: any) => ({
            id: log.id,
            timestamp: log.timestamp,
            action: log.action || 'DESCONOCIDA',
            performedBy: log.performedBy || 'Sistema',
            details: log.details || 'Sin detalles'
          }));

          this.actionTypes = [...new Set(this.allLogs.map(l => l.action))];

          this.filteredLogs = [...this.allLogs];
        },
        error: (err) => {
          console.error('Error cargando los logs de auditoría:', err);
          this.allLogs = [];
          this.filteredLogs = [];
        }
      });
  }

  applyFilters() {
    this.filteredLogs = this.allLogs.filter(log => {
      const matchesAction = this.selectedAction === 'ALL' || log.action === this.selectedAction;

      let matchesDay = true;
      if (this.selectedDate && log.timestamp) {
        const logDay = log.timestamp.split('T')[0];
        const filterDay = this.selectedDate.split('T')[0];
        matchesDay = logDay === filterDay;
      }

      const term = this.searchTerm.toLowerCase().trim();
      const matchesTerm = !term ||
        (log.performedBy && log.performedBy.toLowerCase().includes(term)) ||
        (log.details && log.details.toLowerCase().includes(term));

      return matchesAction && matchesDay && matchesTerm;
    });
    this.cdr.detectChanges();
  }

  clearFilters() {
    this.selectedAction = 'ALL';
    this.selectedDate = '';
    this.searchTerm = '';
    this.filteredLogs = [...this.allLogs];
    this.cdr.detectChanges();
  }

  downloadPDF() {
    if (this.filteredLogs.length === 0) return;
    this.pdfService.exportAdminLogs(this.filteredLogs as any);
  }
}
