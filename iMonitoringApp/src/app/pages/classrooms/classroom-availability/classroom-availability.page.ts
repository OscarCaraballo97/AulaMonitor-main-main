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

  readonly OPENING_HOUR = 7;
  readonly CLOSING_HOUR = 22;
  readonly SATURDAY_CLOSING_HOUR = 12;
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
    const today = new Date();
    const todayYYYYMMDD = this.datePipe.transform(today, 'yyyy-MM-dd', 'UTC') || '';
    this.minDate = todayYYYYMMDD;

    const maxDateCalc = new Date();
    maxDateCalc.setUTCDate(today.getUTCDate() + 30);
    this.maxDate = this.datePipe.transform(maxDateCalc, 'yyyy-MM-dd', 'UTC') || '';

    const dateFromParams = this.route.snapshot.queryParamMap.get('date');
    const classroomIdFromParams = this.route.snapshot.queryParamMap.get('classroomId');

    this.selectedDateYYYYMMDD = (dateFromParams && this.isValidDate(dateFromParams)) ? dateFromParams : todayYYYYMMDD;
    this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00.000Z').toISOString();
    
    if (classroomIdFromParams) {
      this.selectedClassroomId = classroomIdFromParams;
    }
  }

  isValidDate(dateString: string): boolean {
    const regEx = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateString.match(regEx)) return false;
    const d = new Date(dateString + "T00:00:00Z");
    const dNum = d.getTime();
    if (isNaN(dNum)) return false;
    return d.toISOString().slice(0, 10) === dateString;
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
    let newDateStrYYYYMMDD: string | null = null;
    if (typeof isoStringValue === 'string') {
        newDateStrYYYYMMDD = this.datePipe.transform(isoStringValue, 'yyyy-MM-dd', 'UTC') || '';
    }
    
    if (newDateStrYYYYMMDD && this.isValidDate(newDateStrYYYYMMDD)) {
      if (newDateStrYYYYMMDD !== this.selectedDateYYYYMMDD) {
        this.selectedDateYYYYMMDD = newDateStrYYYYMMDD;
        this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00.000Z').toISOString();
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

    this.reservationService.getReservationsByClassroomAndDateRange(this.selectedClassroomId, this.selectedDateYYYYMMDD, this.selectedDateYYYYMMDD)
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
    const selectedDateUTC = new Date(dateStrYYYYMMDD + 'T00:00:00.000Z');
    const dayOfWeek = selectedDateUTC.getUTCDay();

    let currentClosingHour = this.CLOSING_HOUR;
    if (dayOfWeek === 0) return []; 
    if (dayOfWeek === 6) currentClosingHour = this.SATURDAY_CLOSING_HOUR; 

    for (let hour = this.OPENING_HOUR; hour < currentClosingHour; hour++) {
      for (let minute = 0; minute < 60; minute += this.SLOT_DURATION_MINUTES) {
        const slotStart = new Date(Date.UTC(selectedDateUTC.getUTCFullYear(), selectedDateUTC.getUTCMonth(), selectedDateUTC.getUTCDate(), hour, minute));
        const slotEnd = new Date(slotStart.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);
        
        if (slotEnd.getUTCHours() > currentClosingHour || 
           (slotEnd.getUTCHours() === currentClosingHour && slotEnd.getUTCMinutes() > 0)) {
           continue; 
        }

       
        const displayTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        let isReserved = false;
        let reservationInfo: string | undefined;

        for (const res of reservations) {
          const resStart = new Date(res.startTime + 'Z');
          const resEnd = new Date(res.endTime + 'Z'); 

          if (slotStart.getTime() < resEnd.getTime() && slotEnd.getTime() > resStart.getTime()) {
            isReserved = true;
            reservationInfo = res.purpose || 'Reservado';
            break;
          }
        }
        slots.push({ time: displayTime, isReserved, reservationInfo, startISO: slotStart.toISOString(), endISO: slotEnd.toISOString() });
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
    const currentDateObj = new Date(this.selectedDateYYYYMMDD + 'T12:00:00Z'); 
    currentDateObj.setUTCDate(currentDateObj.getUTCDate() + offset);
    const newSelectedYYYYMMDD = this.datePipe.transform(currentDateObj, 'yyyy-MM-dd', 'UTC');
    
    if (newSelectedYYYYMMDD && (!this.minDate || newSelectedYYYYMMDD >= this.minDate) && (!this.maxDate || newSelectedYYYYMMDD <= this.maxDate)) {
        this.selectedDateYYYYMMDD = newSelectedYYYYMMDD;
        this.selectedDateTimeISO = new Date(this.selectedDateYYYYMMDD + 'T00:00:00.000Z').toISOString(); 
        this.updateUrlQueryParams(); 
        if (this.selectedClassroomId) {
            this.loadSlotsForSelectedClassroom();
        }
    } else {
        this.presentToast(offset > 0 ? "No se puede avanzar más allá de la fecha máxima." : "No se puede retroceder más allá de la fecha mínima.", "warning");
    }
  }
}