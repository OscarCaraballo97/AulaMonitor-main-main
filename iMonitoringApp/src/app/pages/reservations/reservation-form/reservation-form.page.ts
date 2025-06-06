import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidatorFn, ValidationErrors } from '@angular/forms';
import { CommonModule, DatePipe, formatDate, TitleCasePipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  LoadingController, ToastController, AlertController, NavController, IonSelect,
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
  IonSpinner, IonItem, IonLabel, IonSelectOption, IonInput, IonButton, IonTextarea
} from '@ionic/angular/standalone';

import { ReservationService } from '../../../services/reservation.service';
import { Reservation, ReservationStatus, ReservationCreationData } from '../../../models/reservation.model';
import { ClassroomService } from '../../../services/classroom.service';
import { Classroom } from '../../../models/classroom.model';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { UserService } from '../../../services/user.service';
import { Observable, Subject, forkJoin, of, combineLatest } from 'rxjs';
import { takeUntil, catchError, tap, finalize, take, switchMap, map, distinctUntilChanged, startWith, filter } from 'rxjs/operators';
import { Rol } from 'src/app/models/rol.model';


function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export function dateTimeOrderValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const startControl = group.get('startTime');
    const endControl = group.get('endTime');
    if (startControl?.value && endControl?.value) {
      const startDate = new Date(startControl.value);
      const endDate = new Date(endControl.value);
      if (endDate <= startDate) {
        endControl.setErrors({ ...endControl.errors, dateTimeOrder: true });
        return { invalidDateTimeOrder: true };
      }
    }
    if (endControl?.hasError('dateTimeOrder')) {
      const errors = { ...endControl.errors };
      if (errors) {
        delete errors['dateTimeOrder'];
        if (Object.keys(errors).length === 0) endControl.setErrors(null);
        else endControl.setErrors(errors);
      }
    }
    return null;
  };
}

interface SelectableDate {
  value: string;
  display: string;
}

@Component({
  selector: 'app-reservation-form',
  templateUrl: './reservation-form.page.html',
  styleUrls: ['./reservation-form.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
    IonSpinner, IonItem, IonLabel, IonSelect, IonSelectOption, IonInput,
    IonButton, IonTextarea
  ],
  providers: [DatePipe]
})
export class ReservationFormPage implements OnInit, OnDestroy {
  @ViewChild('classroomSelectControl') classroomSelectControl!: IonSelect;

  private destroy$ = new Subject<void>();
  reservationForm!: FormGroup;
  isEditMode = false;
  reservationId: string | null = null;
  pageTitle = 'Nueva Reserva';
  isLoading = false;
  isLoadingInitialData = true;
  currentUser: User | null = null;
  userRole: Rol | null = null;
  public RolEnum = Rol;

  classrooms: Classroom[] = [];
  assignableUsers: User[] = [];
  availableStatuses = Object.values(ReservationStatus);

  selectableDates: SelectableDate[] = [];
  selectedDateForTimeSlots: string = ''; 
  availableStartTimes: { value: string, display: string }[] = []; 
  isLoadingTimes = false;
  existingReservationsForDay: Reservation[] = [];
  public reservationOwnerName: string | null = null;
  private originalReservationDataForEdit: Reservation | null = null;

  readonly OPENING_HOUR_LOCAL = 7;
  readonly CLOSING_HOUR_LOCAL = 22; 
  readonly SATURDAY_CLOSING_HOUR_LOCAL = 12; 
  readonly SLOT_DURATION_MINUTES = 60;

  allAvailableDurations: { value: number, display: string }[] = [
    { value: 1, display: `1 hora (1 bloque)` },
    { value: 2, display: `2 horas (2 bloques)` },
    { value: 3, display: `3 horas (3 bloques)` },
    { value: 4, display: `4 horas (4 bloques)` },
    { value: 5, display: `5 horas (5 bloques)` },
    { value: 6, display: `6 horas (6 bloques)` },
  ];
  filteredAvailableDurations: { value: number, display: string }[] = [...this.allAvailableDurations];
  selectedDurationBlocks: number = 1;

  constructor(
    private fb: FormBuilder,
    private reservationService: ReservationService,
    private classroomService: ClassroomService,
    private authService: AuthService,
    private userService: UserService,
    private route: ActivatedRoute,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe,
    private router: Router
  ) {
    this.generateSelectableDates();
  }

  ngOnInit() {
    this.initializeForm();
    this.loadInitialData();
    this.setupFormListeners();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private formatDateToLocalYYYYMMDD(date: Date): string {
      return formatDate(date, 'yyyy-MM-dd', 'en-US', 'local');
  }

  generateSelectableDates() {
    const dates: SelectableDate[] = [];
    const todayLocal = new Date();
    todayLocal.setHours(0, 0, 0, 0); 

    for (let i = 0; i < 30; i++) {
      const currentDateLocal = new Date(todayLocal);
      currentDateLocal.setDate(todayLocal.getDate() + i);


      if (currentDateLocal.getDay() === 0) continue;


      const dateValueUTCString = new Date(Date.UTC(
          currentDateLocal.getFullYear(),
          currentDateLocal.getMonth(),
          currentDateLocal.getDate()
      )).toISOString();

      dates.push({
        value: dateValueUTCString,
        display: formatDate(currentDateLocal, 'EEEE, d \'de\' MMMM \'de\' y', 'es-CO', 'America/Bogota') // Display in local time
      });
    }
    this.selectableDates = dates;
  }

  initializeForm() {
    let defaultDateISOForControl = '';
    if (this.selectableDates.length > 0) {
      defaultDateISOForControl = this.selectableDates[0].value;
    } else {
      
      const today = new Date();
      defaultDateISOForControl = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString();
    }

    this.selectedDateForTimeSlots = formatDate(defaultDateISOForControl, 'yyyy-MM-dd', 'en-US', 'UTC');

    this.reservationForm = this.fb.group({
      classroomId: [null, Validators.required],
      userId: [null],
      reservationDateControl: [defaultDateISOForControl, Validators.required], 
      startTime: [{ value: null, disabled: true }, Validators.required], 
      endTime: [null, Validators.required],                           
      durationBlocks: [this.selectedDurationBlocks, Validators.required],
      status: [{ value: ReservationStatus.PENDIENTE, disabled: true }, Validators.required],
      purpose: ['', [Validators.required, Validators.maxLength(255)]],
    }, { validators: dateTimeOrderValidator() });
  }

  loadInitialData() {
    this.isLoadingInitialData = true;
    this.cdr.detectChanges();

    const user$ = this.authService.getCurrentUser().pipe(take(1));
    const role$ = this.authService.getCurrentUserRole().pipe(take(1));
    const classrooms$ = this.classroomService.getAllClassrooms().pipe(catchError(err => { this.presentToast('Error al cargar las aulas', 'danger'); return of([] as Classroom[]); }));

    forkJoin({ user: user$, role: role$, classrooms: classrooms$ }).pipe(
        takeUntil(this.destroy$),
        switchMap(results => {
            this.currentUser = results.user;
            this.userRole = results.role;
            this.classrooms = results.classrooms;
            const observablesInner: { assignableUsers?: Observable<User[]> } = {};
            if (this.userRole === Rol.COORDINADOR || this.userRole === Rol.ADMIN) {
                observablesInner.assignableUsers = this.userService.getAllUsers().pipe(
                    map(users => users.filter(u => u.id !== this.currentUser?.id)),
                    catchError(err => { this.presentToast('Error al cargar la lista de usuarios.', 'danger'); return of([] as User[]); })
                );
            }
            return Object.keys(observablesInner).length > 0 ? forkJoin(observablesInner).pipe(map(extraResults => ({...results, ...extraResults}))) : of(results);
        }),
        finalize(() => { this.isLoadingInitialData = false; this.cdr.detectChanges(); })
    ).subscribe({
        next: (data: any) => {
            if (data.assignableUsers) this.assignableUsers = data.assignableUsers;
            this.reservationId = this.route.snapshot.paramMap.get('id');
            this.isEditMode = !!this.reservationId;
            this.pageTitle = this.isEditMode ? 'Editar Reserva' : 'Nueva Reserva';
            this.configureFormBasedOnRoleAndMode();

            if (this.isEditMode && this.reservationId) {
                this.loadReservationData(this.reservationId);
            } else {
                if (this.currentUser && !(this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR)) {
                    this.reservationForm.get('userId')?.patchValue(this.currentUser.id, { emitEvent: false });
                }
                const classroomIdFromParams = this.route.snapshot.queryParamMap.get('classroomId');
                const startTimeFromParams = this.route.snapshot.queryParamMap.get('startTime');
                
                if (classroomIdFromParams) this.reservationForm.get('classroomId')?.patchValue(classroomIdFromParams, { emitEvent: true });
                if (startTimeFromParams) {
                    
                    const startTimeAsDate = new Date(startTimeFromParams);
                  
                    const datePartUTCISO = new Date(Date.UTC(startTimeAsDate.getUTCFullYear(), startTimeAsDate.getUTCMonth(), startTimeAsDate.getUTCDate())).toISOString();
                    this.reservationForm.get('reservationDateControl')?.patchValue(datePartUTCISO, { emitEvent: true });
                    this.reservationForm.get('startTime')?.patchValue(startTimeFromParams, { emitEvent: true });
                }
            }
        },
        error: (err: Error) => this.presentToast(err.message || 'Error al cargar datos iniciales.', 'danger')
    });
  }

  setupFormListeners() {
      const classroomAndDate$ = combineLatest([
        this.reservationForm.get('classroomId')!.valueChanges.pipe(startWith(this.reservationForm.get('classroomId')?.value)),
        this.reservationForm.get('reservationDateControl')!.valueChanges.pipe(startWith(this.reservationForm.get('reservationDateControl')?.value))
      ]).pipe(distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)));

      classroomAndDate$.pipe(
        takeUntil(this.destroy$),
        filter(([classroomId, dateStrUTC]) => !!classroomId && !!dateStrUTC),
        tap(() => {
          this.isLoadingTimes = true;
          this.availableStartTimes = [];
          this.reservationForm.get('startTime')?.disable({ emitEvent: false });
          this.reservationForm.get('startTime')?.setValue(null, { emitEvent: false });
          this.cdr.detectChanges();
        }),
        switchMap(([classroomId, dateStrUTC]) => {
          const startOfDayUTC = new Date(dateStrUTC);
          const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);

          return this.reservationService.getReservationsByClassroomAndDateRange(
            classroomId,
            startOfDayUTC.toISOString(), 
            endOfDayUTC.toISOString() 
          )
            .pipe(
              catchError(err => {
                this.presentToast("Error cargando reservas existentes.", "danger");
                return of([] as Reservation[]);
              })
            );
        })
      ).subscribe(reservations => {
        this.existingReservationsForDay = reservations.filter(r =>
            r.id !== this.reservationId &&
            (r.status === ReservationStatus.CONFIRMADA || r.status === ReservationStatus.PENDIENTE)
        );
        this.generateAvailableTimeSlots();
        this.isLoadingTimes = false;

        if (this.availableStartTimes.length > 0) {
            this.reservationForm.get('startTime')?.enable({ emitEvent: false });
        }
        this.cdr.detectChanges();

        const startTimeFromParams = this.route.snapshot.queryParamMap.get('startTime');
        if (startTimeFromParams && this.availableStartTimes.some(slot => slot.value === startTimeFromParams)) {
            this.reservationForm.get('startTime')?.patchValue(startTimeFromParams, { emitEvent: true });
        }
      });

      combineLatest([
        this.reservationForm.get('startTime')!.valueChanges.pipe(startWith(this.reservationForm.get('startTime')?.value as string | null)), // Explicit cast
        this.reservationForm.get('durationBlocks')!.valueChanges.pipe(startWith(this.reservationForm.get('durationBlocks')?.value as number | null)) // Explicit cast
      ]).pipe(takeUntil(this.destroy$))
        .subscribe(([startTimeISO, durationBlocks]) => {
          const currentStartTimeISO: string | null = startTimeISO;
          const currentDurationBlocks: number = durationBlocks || 1; 

          this.selectedDurationBlocks = currentDurationBlocks;
          this.updateEndTimeAndValidateFullSlot(currentStartTimeISO);
          if (currentStartTimeISO) this.filterAvailableDurations(currentStartTimeISO);
      });
  }

  generateAvailableTimeSlots() {
    if (!this.selectedDateForTimeSlots || !this.reservationForm.get('classroomId')?.value) {
      this.availableStartTimes = [];
      this.cdr.detectChanges();
      return;
    }

    const slots: { value: string, display: string }[] = [];
    const selectedLocalDayStart = new Date(this.selectedDateForTimeSlots + 'T00:00:00');
    const dayOfWeekLocal = selectedLocalDayStart.getDay();

    let currentClosingHourLocal = this.CLOSING_HOUR_LOCAL;
    if (dayOfWeekLocal === 0) {
      this.availableStartTimes = [];
      this.cdr.detectChanges();
      return;
    }
    if (dayOfWeekLocal === 6) currentClosingHourLocal = this.SATURDAY_CLOSING_HOUR_LOCAL;

    const nowLocal = new Date();

    const existingReservationTimestamps = this.existingReservationsForDay.map(res => ({
      start: new Date(res.startTime).getTime(),
      end: new Date(res.endTime).getTime()
    }));

    for (let hour = this.OPENING_HOUR_LOCAL; hour < currentClosingHourLocal; hour++) {
      for (let minute = 0; minute < 60; minute += this.SLOT_DURATION_MINUTES) {
        const slotStartLocal = new Date(selectedLocalDayStart.getFullYear(), selectedLocalDayStart.getMonth(), selectedLocalDayStart.getDate(), hour, minute);
        const slotEndLocal = new Date(slotStartLocal.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);

        
        const isSelectedDateTodayLocal = this.formatDateToLocalYYYYMMDD(selectedLocalDayStart) === this.formatDateToLocalYYYYMMDD(nowLocal);
        if (isSelectedDateTodayLocal && slotEndLocal.getTime() <= nowLocal.getTime()) {
            continue;
        }

        if (slotEndLocal.getHours() > currentClosingHourLocal ||
           (slotEndLocal.getHours() === currentClosingHourLocal && slotEndLocal.getMinutes() > 0)) {
           continue;
        }

        
        const slotStartLocalISO = toLocalISOString(slotStartLocal);
        const slotEndLocalISO = toLocalISOString(slotEndLocal);

        let isOccupied = false;
        for (const res of existingReservationTimestamps) {
          if (new Date(slotStartLocalISO).getTime() < res.end && new Date(slotEndLocalISO).getTime() > res.start) {
            isOccupied = true;
            break;
          }
        }

        if (isOccupied) {
            continue;
        }

        slots.push({
          value: slotStartLocalISO,
          display: this.datePipe.transform(slotStartLocal, 'HH:mm', 'local') || ''
        });
      }
    }
    this.availableStartTimes = slots;
    this.cdr.detectChanges();
  }

  onStartTimeSelected(selectedStartTimeISO_UTC: string | null) {
    if (this.isLoadingTimes || !selectedStartTimeISO_UTC) {
        this.reservationForm.get('durationBlocks')?.setValue(1, {emitEvent: true});
        return;
    };
    this.filterAvailableDurations(selectedStartTimeISO_UTC);
  }

  filterAvailableDurations(startTimeISO_UTC: string) {
   
    const startTimeLocal = new Date(startTimeISO_UTC);

    const dayOfWeekLocal = startTimeLocal.getDay();
    const dayClosingHourLocal = (dayOfWeekLocal === 6) ? this.SATURDAY_CLOSING_HOUR_LOCAL : this.CLOSING_HOUR_LOCAL;

    this.filteredAvailableDurations = this.allAvailableDurations.filter(durationOption => {
        const totalDurationMinutes = durationOption.value * this.SLOT_DURATION_MINUTES;
        const potentialEndTimeLocal = new Date(startTimeLocal.getTime() + totalDurationMinutes * 60 * 1000);

        if (potentialEndTimeLocal.getHours() > dayClosingHourLocal ||
           (potentialEndTimeLocal.getHours() === dayClosingHourLocal && potentialEndTimeLocal.getMinutes() > 0)) {
            return false;
        }
        
        const potentialEndTimeUTC = new Date(potentialEndTimeLocal.toISOString());

        for (let i = 0; i < durationOption.value; i++) {
            const currentMiniBlockStartLocal = new Date(startTimeLocal.getTime() + i * this.SLOT_DURATION_MINUTES * 60 * 1000);
            const currentMiniBlockEndLocal = new Date(currentMiniBlockStartLocal.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);

            const currentMiniBlockStartUTC = new Date(currentMiniBlockStartLocal.toISOString());
            const currentMiniBlockEndUTC = new Date(currentMiniBlockEndLocal.toISOString());

            for (const res of this.existingReservationsForDay) {
                const resStartTimeUTC = new Date(res.startTime).getTime();
                const resEndTimeUTC = new Date(res.endTime).getTime();
                if (currentMiniBlockStartUTC.getTime() < resEndTimeUTC && currentMiniBlockEndUTC.getTime() > resStartTimeUTC) {
                    return false;
                }
            }
        }
        return true;
    });

    const currentDuration = this.reservationForm.get('durationBlocks')?.value;
    if (!this.filteredAvailableDurations.some(d => d.value === currentDuration)) {
      this.reservationForm.get('durationBlocks')?.setValue(this.filteredAvailableDurations.length > 0 ? this.filteredAvailableDurations[0].value : null, {emitEvent: true});
    }
    this.cdr.detectChanges();
  }

  updateEndTimeAndValidateFullSlot(startTimeISO: string | null) {
    const durationBlocksValue = this.reservationForm.get('durationBlocks')?.value;
    if (!startTimeISO || !durationBlocksValue) {
      this.reservationForm.patchValue({ endTime: null }, { emitEvent: false });
      return;
    }

    const startTimeLocal = new Date(startTimeISO);
    const totalDurationMinutes = durationBlocksValue * this.SLOT_DURATION_MINUTES;
    const endTimeLocal = new Date(startTimeLocal.getTime() + totalDurationMinutes * 60 * 1000);

    this.reservationForm.patchValue({ endTime: toLocalISOString(endTimeLocal) }, { emitEvent: false });

    this.reservationForm.get('endTime')?.updateValueAndValidity({ emitEvent: false });
    this.cdr.detectChanges();
  }

  configureFormBasedOnRoleAndMode() {
    const userIdControl = this.reservationForm.get('userId');
    const statusControl = this.reservationForm.get('status');

    if (this.userRole === Rol.ADMIN) {
      userIdControl?.enable({ emitEvent: false });
      statusControl?.enable({ emitEvent: false });
    } else if (this.userRole === Rol.COORDINADOR) {
      userIdControl?.enable({ emitEvent: false });
      if (!this.isEditMode) userIdControl?.setValidators(Validators.required);
      userIdControl?.updateValueAndValidity({emitEvent: false});
      statusControl?.disable({ emitEvent: false });
    } else {
      userIdControl?.patchValue(this.currentUser?.id, { emitEvent: false });
      userIdControl?.disable({ emitEvent: false });
      statusControl?.disable({ emitEvent: false });
    }
    if (!this.isEditMode) {
      statusControl?.patchValue(ReservationStatus.PENDIENTE, { emitEvent: false });
    }
    this.cdr.detectChanges();
  }

  async loadReservationData(id: string) {
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: 'Cargando reserva...' });
    await loading.present();

    this.reservationService.getReservationById(id).pipe(
      takeUntil(this.destroy$),
      finalize(async () => {
        this.isLoading = false;
        await loading.dismiss();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res: Reservation) => {
        this.originalReservationDataForEdit = { ...res };
        if (!this.canEditThisReservation(res.status, res.user?.id, res.user?.role)) {
          this.presentToast('No está autorizado para editar esta reserva.', 'danger');
          this.navCtrl.back();
          return;
        }
        this.reservationOwnerName = res.user?.name ?? null;
        const startTimeUTC = new Date(res.startTime);
        const endTimeUTC = new Date(res.endTime);
        const durationMillis = endTimeUTC.getTime() - startTimeUTC.getTime();
        const durationInBlocks = Math.max(1, Math.round(durationMillis / (this.SLOT_DURATION_MINUTES * 60 * 1000)));
        
       
        const dateUTCISO = new Date(Date.UTC(startTimeUTC.getUTCFullYear(), startTimeUTC.getUTCMonth(), startTimeUTC.getUTCDate())).toISOString();
        
        this.selectedDurationBlocks = durationInBlocks;
        this.reservationForm.patchValue({
            classroomId: res.classroom?.id,
            purpose: res.purpose,
            durationBlocks: durationInBlocks,
            reservationDateControl: dateUTCISO,
            status: res.status,
            startTime: res.startTime, 
            userId: res.user?.id
        }, { emitEvent: true });
        this.configureFormBasedOnRoleAndMode();
      },
      error: async (err: Error) => {
        await this.presentToast(err.message || 'Error al cargar la reserva.', 'danger');
        this.navCtrl.back();
      }
    });
  }

  async onSubmit() {
    if (this.reservationForm.invalid) {
      this.markFormGroupTouched(this.reservationForm);
      await this.presentToast('Por favor, completa los campos requeridos correctamente.', 'warning');
      return;
    }
    
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
    await loading.present();
    const formVal = this.reservationForm.getRawValue();

    const payload: ReservationCreationData = {
      classroomId: formVal.classroomId,
      startTime: formVal.startTime,
      endTime: formVal.endTime,
      purpose: formVal.purpose,
      userId: formVal.userId || this.currentUser?.id
    };

    let operation$: Observable<Reservation>;
    if (this.isEditMode && this.reservationId) {
      const updatePayload: Partial<ReservationCreationData> & { status?: ReservationStatus } = { ...payload };
      if (this.userRole === Rol.ADMIN && formVal.status !== this.originalReservationDataForEdit?.status) {
        updatePayload.status = formVal.status;
      }
      operation$ = this.reservationService.updateReservation(this.reservationId, updatePayload);
    } else {
      operation$ = this.reservationService.createReservation(payload);
    }

    operation$.pipe(
      takeUntil(this.destroy$),
      finalize(async () => {
        this.isLoading = false;
        await loading.dismiss().catch(e => console.error(e));
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: async (savedReservation) => {
        await this.presentToast(`Reserva ${this.isEditMode ? 'actualizada' : 'creada'} exitosamente.`, 'success');
        this.navCtrl.navigateBack('/app/reservations/my-list');
      },
      error: async (err: Error) => {
        this.presentToast(err.message || `Error al ${this.isEditMode ? 'actualizar' : 'crear'} la reserva.`, 'danger');
      }
    });
  }

  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) this.markFormGroupTouched(control);
    });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({ message, duration: 3500, color, position: 'top', buttons: [{text:'OK',role:'cancel'}]});
    await toast.present();
  }

  cancel() { this.navCtrl.back(); }
  
  canEditThisReservation(currentStatus?: ReservationStatus, reservationUserId?: string, reservationUserRole?: Rol): boolean {
    if (!this.currentUser || !this.userRole || !reservationUserId) return false;
    if (this.userRole === Rol.ADMIN) return true; 

    const isOwner = this.currentUser.id === reservationUserId;

    if (this.userRole === Rol.COORDINADOR) {
        if (isOwner && currentStatus === ReservationStatus.PENDIENTE) return true;
        if (reservationUserRole === Rol.ESTUDIANTE && (currentStatus === ReservationStatus.PENDIENTE || currentStatus === ReservationStatus.CONFIRMADA)) return true;
    }
    return isOwner && currentStatus === ReservationStatus.PENDIENTE;
  }
}