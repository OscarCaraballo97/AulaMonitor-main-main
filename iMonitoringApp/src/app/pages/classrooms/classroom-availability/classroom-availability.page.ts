import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { ClassroomService } from '../../../services/classroom.service';
import { ReservationService } from '../../../services/reservation.service';
import { Classroom } from '../../../models/classroom.model';
import { Reservation, ReservationStatus } from '../../../models/reservation.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
  IonSpinner, IonLabel, IonSelect, IonSelectOption,
  IonPopover, IonDatetime, AlertController, IonItem } from '@ionic/angular/standalone';
import { ToastController, LoadingController } from '@ionic/angular/standalone';

interface GridCell {
  isReserved: boolean;
  isClosed: boolean;
  userName?: string;
  purpose?: string;
  institution?: string;
}

interface TimeRow {
  timeLabel: string;
  days: GridCell[];
}

@Component({
  selector: 'app-classroom-availability',
  templateUrl: './classroom-availability.page.html',
  styleUrls: ['./classroom-availability.page.scss'],
  standalone: true,
  imports: [IonItem,
    CommonModule, FormsModule, RouterModule,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
    IonSpinner, IonLabel, IonSelect, IonSelectOption,
    IonPopover, IonDatetime
  ],
  providers: [DatePipe]
})
export class ClassroomAvailabilityPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  viewMode: 'WEEKLY' | 'GENERAL' = 'WEEKLY';

  selectedDateYYYYMMDD: string = '';
  selectedDateTimeISO: string = '';
  weekLabel: string = '';

  allClassrooms: Classroom[] = [];
  selectedClassroomId: string | null = null;

  daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  gridRows: TimeRow[] = [];

  isLoadingPage = true;
  isLoadingSlots = false;
  minDate: string = '';
  maxDate: string = '';

  constructor(
    private classroomService: ClassroomService,
    private reservationService: ReservationService,
    private route: ActivatedRoute,
    private router: Router,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private http: HttpClient
  ) {
    const todayLocal = new Date();
    this.minDate = formatDate(todayLocal, 'yyyy-MM-dd', 'en-US', 'local');
    const maxDateCalc = new Date(todayLocal);
    maxDateCalc.setFullYear(todayLocal.getFullYear() + 10);
    this.maxDate = formatDate(maxDateCalc, 'yyyy-MM-dd', 'en-US', 'local');

    const dateFromParams = this.route.snapshot.queryParamMap.get('date');
    const classroomIdFromParams = this.route.snapshot.queryParamMap.get('classroomId');

    if (dateFromParams) {
        this.selectedDateYYYYMMDD = dateFromParams;
        this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T12:00:00').toISOString();
    } else {
        this.selectedDateYYYYMMDD = this.minDate;
        this.selectedDateTimeISO = todayLocal.toISOString();
    }
    if (classroomIdFromParams) {
      this.selectedClassroomId = classroomIdFromParams;
    }
  }

  ngOnInit() {
    this.loadAllClassrooms();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setViewMode(mode: 'WEEKLY' | 'GENERAL') {
    this.viewMode = mode;
    if (this.selectedClassroomId) {
      if (mode === 'WEEKLY') {
        this.loadWeeklyGrid();
      } else {
        this.loadGeneralGrid();
      }
    }
  }

  async loadAllClassrooms() {
    this.isLoadingPage = true;
    this.classroomService.getAllClassrooms().pipe(
      takeUntil(this.destroy$),
      finalize(() => { this.isLoadingPage = false; this.cdr.detectChanges(); }),
      catchError(() => { return of([] as Classroom[]); })
    ).subscribe(classrooms => {
      this.allClassrooms = classrooms;
      if (this.selectedDateYYYYMMDD && this.selectedClassroomId) {
        this.setViewMode(this.viewMode);
      }
    });
  }

  onDateTimeChanged(val: any) {
    if (typeof val === 'string') {
      const newDate = formatDate(new Date(val), 'yyyy-MM-dd', 'en-US', 'local');
      if (newDate && newDate !== this.selectedDateYYYYMMDD) {
        this.selectedDateYYYYMMDD = newDate;
        this.updateUrlQueryParams();
        if (this.selectedClassroomId) this.setViewMode('WEEKLY');
      }
    }
  }

  onClassroomSelected(event: any) {
    this.selectedClassroomId = event.detail.value || null;
    this.updateUrlQueryParams();
    if (this.selectedClassroomId) {
      this.setViewMode(this.viewMode);
    } else {
      this.gridRows = [];
    }
  }

  private updateUrlQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: this.selectedDateYYYYMMDD, classroomId: this.selectedClassroomId || undefined },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  changeWeek(offsetDays: number) {
    const d = new Date(this.selectedDateYYYYMMDD + 'T12:00:00');
    d.setDate(d.getDate() + offsetDays);
    this.selectedDateYYYYMMDD = formatDate(d, 'yyyy-MM-dd', 'en-US', 'local');
    this.selectedDateTimeISO = d.toISOString();
    this.updateUrlQueryParams();
    if (this.selectedClassroomId) this.setViewMode('WEEKLY');
  }

  // === 1. CARGA DE SEMANA ESPECÍFICA ===
  async loadWeeklyGrid() {
    this.isLoadingSlots = true;
    this.gridRows = [];
    this.cdr.detectChanges();

    const curr = new Date(this.selectedDateYYYYMMDD + 'T12:00:00');
    const day = curr.getDay() || 7;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - day + 1);
    monday.setHours(0,0,0,0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);

    this.weekLabel = `Semana del ${formatDate(monday, 'dd/MM', 'en-US')} al ${formatDate(sunday, 'dd/MM', 'en-US')}`;

    this.reservationService.getReservationsByClassroomAndDateRange(this.selectedClassroomId!, monday.toISOString(), sunday.toISOString())
      .pipe(takeUntil(this.destroy$), finalize(() => { this.isLoadingSlots = false; this.cdr.detectChanges(); }), catchError(() => of([])))
      .subscribe(res => { this.buildGrid(res, monday); });
  }

  buildGrid(reservations: Reservation[], monday: Date) {
    const relevantRes = reservations.filter(r => r.status === ReservationStatus.CONFIRMADA);
    this.gridRows = [];
    let pointer = new Date(monday);
    pointer.setHours(6, 0, 0, 0);

    while (pointer.getHours() < 22) {
      const cellEnd = new Date(pointer.getTime() + 45 * 60000);
      const timeLabel = this.datePipe.transform(pointer, 'HH:mm') + ' - ' + this.datePipe.transform(cellEnd, 'HH:mm');
      const row: TimeRow = { timeLabel, days: [] };

      for (let i = 0; i < 6; i++) {
        const currentSlotStart = new Date(monday);
        currentSlotStart.setDate(monday.getDate() + i);
        currentSlotStart.setHours(pointer.getHours(), pointer.getMinutes(), 0, 0);
        const currentSlotEnd = new Date(currentSlotStart.getTime() + 45 * 60000);

        const isClosed = (i === 5 && pointer.getHours() >= 12);
        const res = relevantRes.find(r => {
          const rStart = new Date(r.startTime).getTime();
          const rEnd = new Date(r.endTime).getTime();
          return rStart < currentSlotEnd.getTime() && rEnd > currentSlotStart.getTime();
        });

        row.days.push({
          isClosed: isClosed,
          isReserved: !!res,
          userName: res?.user?.name,
          purpose: res?.purpose,
          // Corrección: Lee la institución de la reserva primero, si no, usa la del usuario
          institution: (res as any)?.institution || (res?.user as any)?.institution
        });
      }
      this.gridRows.push(row);
      pointer = cellEnd;
    }
  }

  // === 2. CARGA DE HORARIO FIJO (RECURRENTES) ===
  async loadGeneralGrid() {
    this.isLoadingSlots = true;
    this.gridRows = [];
    this.cdr.detectChanges();

    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 4);

    this.reservationService.getReservationsByClassroomAndDateRange(this.selectedClassroomId!, start.toISOString(), end.toISOString())
      .pipe(takeUntil(this.destroy$), finalize(() => { this.isLoadingSlots = false; this.cdr.detectChanges(); }), catchError(() => of([])))
      .subscribe(res => { this.buildGeneralGrid(res); });
  }

  buildGeneralGrid(reservations: Reservation[]) {
    const relevantRes = reservations.filter(r => r.status === ReservationStatus.CONFIRMADA);
    this.gridRows = [];
    let pointer = new Date();
    pointer.setHours(6, 0, 0, 0);

    while (pointer.getHours() < 22) {
      const cellEnd = new Date(pointer.getTime() + 45 * 60000);
      const timeLabel = this.datePipe.transform(pointer, 'HH:mm') + ' - ' + this.datePipe.transform(cellEnd, 'HH:mm');
      const row: TimeRow = { timeLabel, days: [] };

      for (let i = 1; i <= 6; i++) {
        const isClosed = (i === 6 && pointer.getHours() >= 12);

        const matchingRes = relevantRes.filter(r => {
            const rStart = new Date(r.startTime);
            const rEnd = new Date(r.endTime);
            if (rStart.getDay() !== (i === 7 ? 0 : i)) return false;

            const startMins = rStart.getHours() * 60 + rStart.getMinutes();
            const endMins = rEnd.getHours() * 60 + rEnd.getMinutes();
            const cellStartMins = pointer.getHours() * 60 + pointer.getMinutes();
            const cellEndMins = cellStartMins + 45;

            return startMins < cellEndMins && endMins > cellStartMins;
        });

        let cellPurpose = '';
        let cellUser = '';
        let cellInst = '';
        let isReserved = false;

        if (matchingRes.length > 0) {
            const freqMap = new Map<string, number>();
            let maxCount = 0;
            let dominantRes = matchingRes[0];

            for (const r of matchingRes) {
                const key = r.purpose + '|' + r.user?.name;
                const count = (freqMap.get(key) || 0) + 1;
                freqMap.set(key, count);
                if (count > maxCount) {
                    maxCount = count;
                    dominantRes = r;
                }
            }

            cellPurpose = dominantRes.purpose || 'Clase';
            cellUser = dominantRes.user?.name || 'Desconocido';
            // Corrección: Lee la institución de la reserva dominante
            cellInst = (dominantRes as any)?.institution || (dominantRes.user as any)?.institution;
            isReserved = true;
        }

        row.days.push({ isClosed, isReserved, userName: cellUser, purpose: cellPurpose, institution: cellInst });
      }
      this.gridRows.push(row);
      pointer = cellEnd;
    }
  }

  public getSelectedClassroomDetails() { return this.allClassrooms.find(c => c.id === this.selectedClassroomId); }

  async promptDownloadSchedule() {
    const alertInst = await this.alertCtrl.create({
      header: 'Descargar Horarios',
      message: '¿De qué institución deseas generar el documento Excel?',
      inputs: [
        { type: 'radio', label: 'General', value: 'General', checked: true },
        { type: 'radio', label: 'Solo Colombo', value: 'Colombo' },
        { type: 'radio', label: 'Solo Unicolombo', value: 'Unicolombo' }
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Siguiente', handler: (inst) => this.promptFormatAndDownload(inst) }
      ]
    });
    await alertInst.present();
  }

  async promptFormatAndDownload(institution: string) {
    const alertFormat = await this.alertCtrl.create({
      header: 'Formato del Documento',
      message: 'Elige cómo organizar la información:',
      inputs: [
        { type: 'radio', label: '📆 Calendario Mensual (Almanaque)', value: 'ALMANAQUE', checked: true },
        { type: 'radio', label: '📅 Matriz Semestral (Día a Día)', value: 'CUADRICULA' },
        { type: 'radio', label: '🏫 Horario Fijo (Recurrentes)', value: 'PLANTILLA' }
      ],
      buttons: [
        { text: 'Atrás', role: 'cancel', handler: () => this.promptDownloadSchedule() },
        { text: 'Descargar', handler: (format) => this.downloadExcel(institution, format) }
      ]
    });
    await alertFormat.present();
  }

  async downloadExcel(institution: string, format: string) {
    const loading = await this.loadingCtrl.create({ message: 'Generando Excel...' });
    await loading.present();

    this.http.get(`${environment.apiUrl}/reservations/export-schedule?institution=${institution}&format=${format}`, {
      responseType: 'blob'
    }).subscribe({
      next: async (blob) => {
        await loading.dismiss();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Horario_${institution}_${format}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: async () => {
        await loading.dismiss();
        const toast = await this.toastCtrl.create({ message: 'Error al generar el archivo.', duration: 3000, color: 'danger' });
        toast.present();
      }
    });
  }
}
