import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, formatDate, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, of } from 'rxjs';
import { takeUntil, catchError, tap, finalize } from 'rxjs/operators';
import { ClassroomService } from '../../../services/classroom.service';
import { ReservationService } from '../../../services/reservation.service';
import { Classroom } from '../../../models/classroom.model';
import { Reservation, ReservationStatus } from '../../../models/reservation.model';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
  IonSpinner, IonCard, IonCardContent, IonChip, IonLabel, IonSelect, IonSelectOption, IonItem,
  IonPopover, IonDatetime, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
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
  isReserved: boolean;
  reservationInfo?: string;
  startISO?: string;
  endISO?: string;
}

@Component({
  selector: 'app-classroom-availability',
  templateUrl: './classroom-availability.page.html',
  styleUrls: ['./classroom-availability.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TitleCasePipe,
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

  readonly OPENING_HOUR_LOCAL = 7;
  readonly CLOSING_HOUR_LOCAL = 22; 
  readonly SATURDAY_CLOSING_HOUR_LOCAL = 12;
  readonly SLOT_DURATION_MINUTES = 60;

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

    const maxDateCalc = new Date(todayLocal);
    maxDateCalc.setDate(todayLocal.getDate() + 30);
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
    const dNum = d.getTime();
    if (isNaN(dNum)) return false;
    return this.formatDateToLocalYYYYMMDD(d) === dateString;
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
    this.cdr.detectChanges();
    const loading = await this.loadingCtrl.create({ message: 'Cargando aulas...' });
    await loading.present();

    this.classroomService.getAllClassrooms().pipe(
      takeUntil(this.destroy$),
      finalize(async () => {
        this.isLoadingPage = false;
        const currentLoading = await this.loadingCtrl.getTop();
        if (currentLoading) { await currentLoading.dismiss().catch(e => console.warn(e)); }
        this.cdr.detectChanges();
      }),
      catchError(err => {
        this.presentToast("Error al cargar la lista de aulas.", "danger");
        this.allClassrooms = [];
        return of([] as Classroom[]);
      })
    ).subscribe(classrooms => {
      this.allClassrooms = classrooms;
      if (classrooms.length > 0) {
        if (this.selectedClassroomId && !this.allClassrooms.find(c => c.id === this.selectedClassroomId)) {
          this.selectedClassroomId = null;
        }
        if (this.selectedDateYYYYMMDD && this.selectedClassroomId) {
          this.loadSlotsForSelectedClassroom();
        }
      } else {
          this.presentToast("No hay aulas configuradas.", "warning");
      }
    });
  }

  onDateTimeChanged(isoStringValue: string | string[] | null | undefined) {
    let newDateStrLocal: string | null = null;
    if (typeof isoStringValue === 'string') {
        
        newDateStrLocal = this.formatDateToLocalYYYYMMDD(new Date(isoStringValue)) || '';
    }

    if (newDateStrLocal && this.isValidDate(newDateStrLocal)) {
      if (newDateStrLocal !== this.selectedDateYYYYMMDD) {
        this.selectedDateYYYYMMDD = newDateStrLocal;
        this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00').toISOString();
        this.updateUrlQueryParams();
        if (this.selectedClassroomId) {
          this.loadSlotsForSelectedClassroom();
        }
      }
    }
  }

  onClassroomSelected(event: any) {
    const classroomId = event.detail.value;
    this.selectedClassroomId = classroomId || null;
    this.updateUrlQueryParams();
    if (this.selectedClassroomId && this.selectedDateYYYYMMDD) {
      this.loadSlotsForSelectedClassroom();
    } else {
      this.timeSlotsForSelectedClassroom = [];
      this.availabilityError = null;
    }
  }

  private updateUrlQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        date: this.selectedDateYYYYMMDD, 
        classroomId: this.selectedClassroomId || undefined
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  async loadSlotsForSelectedClassroom() {
    if (!this.selectedClassroomId || !this.selectedDateYYYYMMDD) {
      this.timeSlotsForSelectedClassroom = [];
      this.isLoadingSlots = false;
      this.cdr.detectChanges();
      return;
    }

    this.isLoadingSlots = true;
    this.availabilityError = null;
    this.timeSlotsForSelectedClassroom = [];
    this.cdr.detectChanges();

    const localStartDate = new Date(this.selectedDateYYYYMMDD + 'T00:00:00');
    const localEndDate = new Date(this.selectedDateYYYYMMDD + 'T23:59:59.999');

    const utcStartDateISO = localStartDate.toISOString(); 
    const utcEndDateISO = localEndDate.toISOString();   

    this.reservationService.getReservationsByClassroomAndDateRange(
      this.selectedClassroomId,
      utcStartDateISO,
      utcEndDateISO   
    )
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoadingSlots = false;
          this.cdr.detectChanges();
        }),
        catchError(err => {
          this.availabilityError = `Error: ${err.message || 'No se pudo cargar la disponibilidad.'}`;
          this.timeSlotsForSelectedClassroom = this.generateTimeSlotsForDay(this.selectedDateYYYYMMDD, []);
          return of([] as Reservation[]);
        })
      )
      .subscribe(reservations => {
        this.timeSlotsForSelectedClassroom = this.generateTimeSlotsForDay(this.selectedDateYYYYMMDD, reservations);
      });
  }

  public getSelectedClassroomDetails(): Classroom | undefined {
    if (!this.selectedClassroomId || !this.allClassrooms) {
      return undefined;
    }
    return this.allClassrooms.find(c => c.id === this.selectedClassroomId);
  }

  generateTimeSlotsForDay(dateStrYYYYMMDD: string, reservations: Reservation[]): TimeSlot[] {
    const slots: TimeSlot[] = [];

    const selectedLocalDayStart = new Date(dateStrYYYYMMDD + 'T00:00:00');
    const dayOfWeekLocal = selectedLocalDayStart.getDay();

    let currentClosingHourLocal = this.CLOSING_HOUR_LOCAL;
    if (dayOfWeekLocal === 0) return [];
    if (dayOfWeekLocal === 6) currentClosingHourLocal = this.SATURDAY_CLOSING_HOUR_LOCAL;

    const nowLocal = new Date();

    const relevantReservationTimestamps = reservations.filter(res =>
        res.status === ReservationStatus.CONFIRMADA || res.status === ReservationStatus.PENDIENTE
    ).map(res => ({
        start: new Date(res.startTime).getTime(),
        end: new Date(res.endTime).getTime()
    }));

    for (let hour = this.OPENING_HOUR_LOCAL; hour < currentClosingHourLocal; hour++) {
      for (let minute = 0; minute < 60; minute += this.SLOT_DURATION_MINUTES) {
        let isReserved = false;
        let reservationInfo: string | undefined;


        const slotStartLocal = new Date(selectedLocalDayStart.getFullYear(), selectedLocalDayStart.getMonth(), selectedLocalDayStart.getDate(), hour, minute);
        const slotEndLocal = new Date(slotStartLocal.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);

     
        const isSelectedDateTodayLocal = this.formatDateToLocalYYYYMMDD(selectedLocalDayStart) === this.formatDateToLocalYYYYMMDD(nowLocal);
        if (isSelectedDateTodayLocal && slotEndLocal.getTime() <= nowLocal.getTime()) {
            continue;
        }

        if (slotEndLocal.getHours() > currentClosingHourLocal ||
           (slotEndLocal.getHours() === currentClosingHourLocal && slotEndLocal.getMinutes() > 0)) {
            if (slotEndLocal.getHours() === currentClosingHourLocal && slotEndLocal.getMinutes() === 0 && this.SLOT_DURATION_MINUTES === 60) {
            } else {
                continue;
            }
        }

        const slotStartLocalISO = toLocalISOString(slotStartLocal);
        const slotEndLocalISO = toLocalISOString(slotEndLocal);

        for (const resTimestamp of relevantReservationTimestamps) {
          if (new Date(slotStartLocalISO).getTime() < resTimestamp.end && new Date(slotEndLocalISO).getTime() > resTimestamp.start) {
            isReserved = true;
            const originalRes = reservations.find(r => new Date(r.startTime).getTime() === resTimestamp.start);
            reservationInfo = originalRes?.purpose || 'Reservado';
            break;
          }
        }
      
        slots.push({
          time: this.datePipe.transform(slotStartLocal, 'HH:mm', 'local') || '', 
          isReserved,
          reservationInfo,
          startISO: slotStartLocalISO,
          endISO: slotEndLocalISO
        });
      }
    }
    return slots;
  }

  getSlotClass(slot: TimeSlot): string {
    if (slot.isReserved) return 'bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-100 cursor-not-allowed';
    return 'bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-100 hover:bg-green-300 dark:hover:bg-green-600 cursor-pointer';
  }

  async onSlotClick(slot: TimeSlot) {
    if (!this.selectedClassroomId) return;
    if (slot.isReserved) {
      await this.presentToast(`Reservado: ${slot.reservationInfo || 'No disponible'}`, "medium");
    } else if (slot.startISO && slot.endISO) {
      this.router.navigate(['/app/reservations/new'], {
        queryParams: { classroomId: this.selectedClassroomId, startTime: slot.startISO, endTime: slot.endISO }
      });
    }
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' | 'medium' | 'light', duration: number = 3000) {
    if (!message) return;
    const toast = await this.toastCtrl.create({ message, duration, color, position: 'top', buttons: [{text:'OK',role:'cancel'}] });
    await toast.present();
  }

  changeDay(offset: number) {

    const currentDateObjLocal = new Date(this.selectedDateYYYYMMDD + 'T12:00:00'); 
    currentDateObjLocal.setDate(currentDateObjLocal.getDate() + offset);

    const newSelectedYYYYMMDD = this.formatDateToLocalYYYYMMDD(currentDateObjLocal);
    
    const minDateObj = new Date(this.minDate + 'T00:00:00');
    const maxDateObj = new Date(this.maxDate + 'T23:59:59');

    if (currentDateObjLocal.getTime() >= minDateObj.getTime() && currentDateObjLocal.getTime() <= maxDateObj.getTime()) {
        this.selectedDateYYYYMMDD = newSelectedYYYYMMDD;
        this.selectedDateTimeISO = currentDateObjLocal.toISOString();
        this.updateUrlQueryParams();
        if (this.selectedClassroomId) {
            this.loadSlotsForSelectedClassroom();
        }
    } else {
        this.presentToast(offset > 0 ? "No se puede avanzar más allá de la fecha máxima." : "No se puede retroceder más allá de la fecha mínima.", "warning");
    }
  }

  async handleRefresh(event: any) {
    await this.loadAllClassrooms();
    event.target.complete();
  }
}