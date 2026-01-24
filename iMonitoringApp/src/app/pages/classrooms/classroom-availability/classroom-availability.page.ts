import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, formatDate, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';
import { ClassroomService } from '../../../services/classroom.service';
import { ReservationService } from '../../../services/reservation.service';
import { Classroom } from '../../../models/classroom.model';
import { Reservation, ReservationStatus } from '../../../models/reservation.model';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
  IonSpinner, IonCard, IonCardContent, IonChip, IonLabel, IonSelect, IonSelectOption, IonItem,
  IonPopover, IonDatetime } from '@ionic/angular/standalone';
import { ToastController, LoadingController } from '@ionic/angular/standalone';

function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

interface TimeSlot {
  time: string;
  endTimeLabel: string;
  isReserved: boolean;
  reservationInfo?: string;
}

@Component({
  selector: 'app-classroom-availability',
  templateUrl: './classroom-availability.page.html',
  styleUrls: ['./classroom-availability.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
    IonSpinner, IonCard, IonCardContent, IonChip, IonLabel, IonSelect, IonSelectOption, IonItem,
    IonPopover, IonDatetime
  ],
  providers: [DatePipe]
})
export class ClassroomAvailabilityPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  selectedDateYYYYMMDD: string = '';
  selectedDateTimeISO: string = '';
  allClassrooms: Classroom[] = [];
  selectedClassroomId: string | null = null;
  timeSlotsForSelectedClassroom: TimeSlot[] = [];
  isLoadingPage = true;
  isLoadingSlots = false;
  availabilityError: string | null = null;
  minDate: string = '';
  maxDate: string = '';

  readonly OPENING_HOUR_LOCAL = 6;
  readonly CLOSING_HOUR_LOCAL = 24;
  readonly SATURDAY_CLOSING_HOUR_LOCAL = 12;
  readonly SLOT_DURATION_MINUTES = 45;

  constructor(
    private classroomService: ClassroomService,
    private reservationService: ReservationService,
    private route: ActivatedRoute,
    private router: Router,
    private datePipe: DatePipe,
    private cdr: ChangeDetectorRef,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {
    const todayLocal = new Date();
    this.minDate = this.formatDateToLocalYYYYMMDD(todayLocal);

    // CORRECCIÓN AQUÍ: Se suman 10 años en lugar de 30 días
    const maxDateCalc = new Date(todayLocal);
    maxDateCalc.setFullYear(todayLocal.getFullYear() + 10);
    this.maxDate = this.formatDateToLocalYYYYMMDD(maxDateCalc);

    const dateFromParams = this.route.snapshot.queryParamMap.get('date');
    const classroomIdFromParams = this.route.snapshot.queryParamMap.get('classroomId');

    if (dateFromParams && this.isValidDate(dateFromParams)) {
        this.selectedDateYYYYMMDD = dateFromParams;
        this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00').toISOString();
    } else {
        this.selectedDateYYYYMMDD = this.formatDateToLocalYYYYMMDD(todayLocal);
        this.selectedDateTimeISO = todayLocal.toISOString();
    }
    if (classroomIdFromParams) {
      this.selectedClassroomId = classroomIdFromParams;
    }
  }

  private formatDateToLocalYYYYMMDD(date: Date): string {
      return formatDate(date, 'yyyy-MM-dd', 'en-US', 'local');
  }

  isValidDate(dateString: string): boolean {
    const regEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regEx)) return false;
    const d = new Date(dateString + "T00:00:00");
    return !isNaN(d.getTime()) && this.formatDateToLocalYYYYMMDD(d) === dateString;
  }

  ngOnInit() {
    this.loadAllClassrooms();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadAllClassrooms() {
    this.isLoadingPage = true;
    const loading = await this.loadingCtrl.create({ message: 'Cargando aulas...' });
    await loading.present();

    this.classroomService.getAllClassrooms().pipe(
      takeUntil(this.destroy$),
      finalize(async () => {
        this.isLoadingPage = false;
        const current = await this.loadingCtrl.getTop();
        if (current) await current.dismiss();
        this.cdr.detectChanges();
      }),
      catchError(() => {
        this.presentToast("Error al cargar aulas.", "danger");
        return of([] as Classroom[]);
      })
    ).subscribe(classrooms => {
      this.allClassrooms = classrooms;
      if (this.selectedClassroomId && !this.allClassrooms.find(c => c.id === this.selectedClassroomId)) {
        this.selectedClassroomId = null;
      }
      if (this.selectedDateYYYYMMDD && this.selectedClassroomId) {
        this.loadSlotsForSelectedClassroom();
      }
    });
  }

  onDateTimeChanged(val: any) {
    if (typeof val === 'string') {
      const newDate = this.formatDateToLocalYYYYMMDD(new Date(val));
      if (newDate && this.isValidDate(newDate) && newDate !== this.selectedDateYYYYMMDD) {
        this.selectedDateYYYYMMDD = newDate;
        this.selectedDateTimeISO = new Date(newDate + 'T00:00:00').toISOString();
        this.updateUrlQueryParams();
        if (this.selectedClassroomId) this.loadSlotsForSelectedClassroom();
      }
    }
  }

  onClassroomSelected(event: any) {
    this.selectedClassroomId = event.detail.value || null;
    this.updateUrlQueryParams();
    if (this.selectedClassroomId && this.selectedDateYYYYMMDD) {
      this.loadSlotsForSelectedClassroom();
    } else {
      this.timeSlotsForSelectedClassroom = [];
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

  async loadSlotsForSelectedClassroom() {
    if (!this.selectedClassroomId || !this.selectedDateYYYYMMDD) return;
    this.isLoadingSlots = true;
    this.availabilityError = null;
    this.timeSlotsForSelectedClassroom = [];
    this.cdr.detectChanges();

    const startISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00').toISOString();
    const endISO = new Date(this.selectedDateYYYYMMDD + 'T23:59:59.999').toISOString();

    this.reservationService.getReservationsByClassroomAndDateRange(this.selectedClassroomId, startISO, endISO)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => { this.isLoadingSlots = false; this.cdr.detectChanges(); }),
        catchError(err => {
          this.availabilityError = 'No se pudo cargar disponibilidad.';
          return of([]);
        })
      )
      .subscribe(res => {
        this.timeSlotsForSelectedClassroom = this.generateTimeSlots(this.selectedDateYYYYMMDD, res);
      });
  }

  public getSelectedClassroomDetails() {
    return this.allClassrooms.find(c => c.id === this.selectedClassroomId);
  }

  generateTimeSlots(dateStr: string, reservations: Reservation[]): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = dayStart.getDay();

    if (dayOfWeek === 0) return [];

    let closingHour = this.CLOSING_HOUR_LOCAL;
    if (dayOfWeek === 6) closingHour = this.SATURDAY_CLOSING_HOUR_LOCAL;

    let pointer = new Date(dayStart);
    pointer.setHours(this.OPENING_HOUR_LOCAL, 0, 0, 0);
    const endLimit = new Date(dayStart);
    endLimit.setHours(closingHour, 0, 0, 0);

    const relevantRes = reservations.filter(r =>
        r.status === ReservationStatus.CONFIRMADA || r.status === ReservationStatus.PENDIENTE
    ).map(r => ({ start: new Date(r.startTime).getTime(), end: new Date(r.endTime).getTime(), info: r.purpose }));

    while (pointer < endLimit) {
      const sStart = new Date(pointer);
      const sEnd = new Date(pointer.getTime() + this.SLOT_DURATION_MINUTES * 60000);

      if (sEnd > endLimit && sEnd.getHours() !== closingHour) break;

      // Check ocupación
      let isReserved = false;
      let info = '';
      for (const res of relevantRes) {
        if (res.start < sEnd.getTime() && res.end > sStart.getTime()) {
          isReserved = true;
          info = res.info;
          break;
        }
      }

      slots.push({
        time: this.datePipe.transform(sStart, 'HH:mm') || '',
        endTimeLabel: this.datePipe.transform(sEnd, 'HH:mm') || '',
        isReserved,
        reservationInfo: info
      });

      pointer = sEnd;
    }
    return slots;
  }

  getSlotClass(slot: TimeSlot): string {
    if (slot.isReserved) return 'bg-red-200 text-red-800 cursor-default opacity-80';
    return 'bg-green-100 text-green-800 cursor-default border border-green-200';
  }

  async onSlotClick(slot: TimeSlot) {
    if (slot.isReserved) {
      await this.presentToast(`Ocupado: ${slot.reservationInfo || 'Reservado'}`, "medium");
    }
  }

  changeDay(offset: number) {
    const d = new Date(this.selectedDateYYYYMMDD + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    const newDate = this.formatDateToLocalYYYYMMDD(d);

    if (d.getTime() >= new Date(this.minDate + 'T00:00:00').getTime() &&
        d.getTime() <= new Date(this.maxDate + 'T23:59:59').getTime()) {
        this.selectedDateYYYYMMDD = newDate;
        this.selectedDateTimeISO = d.toISOString();
        this.updateUrlQueryParams();
        if (this.selectedClassroomId) this.loadSlotsForSelectedClassroom();
    }
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'top' });
    toast.present();
  }
}
