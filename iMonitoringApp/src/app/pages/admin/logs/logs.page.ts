import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { PdfService } from '../../../services/pdf.service';
import { ClassroomService } from '../../../services/classroom.service';
import { Classroom } from '../../../models/classroom.model';

import {
  IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonMenuButton,
  IonButton, IonIcon, IonSpinner, IonSelect, IonSelectOption, IonInput
} from '@ionic/angular/standalone';

export interface UsageLog {
  reservationId: string;
  classroomName: string;
  userName: string;
  role: string;
  startTime: string;
  endTime: string;
  purpose: string;
}

@Component({
  selector: 'app-logs',
  templateUrl: './logs.page.html',
  styleUrls: ['./logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonMenuButton,
    IonButton, IonIcon, IonSpinner, IonSelect, IonSelectOption, IonInput
  ],
  providers: [DatePipe]
})
export class LogsPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  allLogs: UsageLog[] = [];
  filteredLogs: UsageLog[] = [];
  classrooms: Classroom[] = [];

  selectedClassroom: string = 'ALL';
  selectedDate: string = '';
  searchTerm: string = '';

  isLoading = true;

  constructor(
    private http: HttpClient,
    private classroomService: ClassroomService,
    private pdfService: PdfService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadClassrooms();
    this.loadLogs();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClassrooms() {
    this.classroomService.getAllClassrooms()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (c) => {
          this.classrooms = c;
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error cargando aulas', err)
      });
  }

  loadLogs() {
    this.isLoading = true;

    this.http.get<any[]>(`${environment.apiUrl}/reservations`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoading = false;
          this.applyFilters();
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (data) => {
          this.allLogs = data.map(res => ({
            reservationId: res.id,
            classroomName: res.classroom?.name || res.classroom || 'Sin Aula',
            userName: res.user?.name || res.user?.email || 'Usuario',
            role: res.user?.role || 'N/A',
            startTime: res.startTime || '',
            endTime: res.endTime || '',
            purpose: res.purpose || 'Sin motivo'
          }));
        },
        error: (err) => console.error('Error cargando logs de auditoría', err)
      });
  }

  applyFilters() {
    this.filteredLogs = this.allLogs.filter(log => {
      const matchesClassroom = this.selectedClassroom === 'ALL' || log.classroomName === this.selectedClassroom;

      let matchesDay = true;
      if (this.selectedDate && log.startTime) {
        const logDay = log.startTime.split('T')[0];
        const filterDay = this.selectedDate.split('T')[0];
        matchesDay = logDay === filterDay;
      } else if (this.selectedDate && !log.startTime) {
        matchesDay = false;
      }

      const term = this.searchTerm.toLowerCase().trim();
      const matchesTerm = !term ||
        (log.userName && log.userName.toLowerCase().includes(term)) ||
        (log.purpose && log.purpose.toLowerCase().includes(term));

      return matchesClassroom && matchesDay && matchesTerm;
    });
    this.cdr.detectChanges();
  }

  clearFilters() {
    this.selectedClassroom = 'ALL';
    this.selectedDate = '';
    this.searchTerm = '';
    this.applyFilters();
  }

  downloadPDF() {
    if (this.filteredLogs.length === 0) return;
    this.pdfService.exportAdminLogs(this.filteredLogs);
  }
}
