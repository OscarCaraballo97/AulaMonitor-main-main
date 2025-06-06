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

  generateSelectableDates() {
    const dates: SelectableDate[] = [];
    const todayForIteration = new Date();
    for (let i = 0; i < 30; i++) {
      const currentDateLocal = new Date(todayForIteration);
      currentDateLocal.setDate(todayForIteration.getDate() + i);
      currentDateLocal.setHours(0, 0, 0, 0);
      if (currentDateLocal.getDay() !== 0) {
        const dateValueUTCString = new Date(Date.UTC(currentDateLocal.getFullYear(), currentDateLocal.getMonth(), currentDateLocal.getDate())).toISOString();
        dates.push({
          value: dateValueUTCString,
          display: formatDate(currentDateLocal, 'EEEE, d \'de\' MMMM \'de\' y', 'es-CO', 'America/Bogota')
        });
      }
    }
    this.selectableDates = dates;
  }

  initializeForm() {
    let defaultDateISOForControl = '';
    if (this.selectableDates.length > 0) {
      defaultDateISOForControl = this.selectableDates[0].value;
    } else {
      const todayForFallback = new Date();
      defaultDateISOForControl = new Date(Date.UTC(todayForFallback.getFullYear(), todayForFallback.getMonth(), todayForFallback.getDate())).toISOString();
    }
    this.selectedDateForTimeSlots = formatDate(new Date(defaultDateISOForControl), 'yyyy-MM-dd', 'en-US', 'UTC');

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
                    const selectedDate = new Date(startTimeFromParams);
                    const dateUTCForControl = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate())).toISOString();
                    this.reservationForm.get('reservationDateControl')?.patchValue(dateUTCForControl, { emitEvent: true });
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
        switchMap(([classroomId, dateStrUTC]) => 
          this.reservationService.getReservationsByClassroomAndDateRange(classroomId, dateStrUTC.substring(0, 10))
            .pipe(
              catchError(err => {
                this.presentToast("Error cargando reservas existentes.", "danger");
                return of([] as Reservation[]);
              })
            )
        )
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
        this.reservationForm.get('startTime')!.valueChanges.pipe(startWith(this.reservationForm.get('startTime')?.value)),
        this.reservationForm.get('durationBlocks')!.valueChanges.pipe(startWith(this.reservationForm.get('durationBlocks')?.value))
      ]).pipe(takeUntil(this.destroy$))
        .subscribe(([startTimeISO, durationBlocks]) => {
          this.selectedDurationBlocks = durationBlocks || 1;
          this.updateEndTimeAndValidateFullSlot(startTimeISO);
          if (startTimeISO) this.filterAvailableDurations(startTimeISO);
      });
  }

  generateAvailableTimeSlots() {
    if (!this.selectedDateForTimeSlots || !this.reservationForm.get('classroomId')?.value) {
      this.availableStartTimes = []; this.cdr.detectChanges(); return;
    }
    const slots: { value: string, display: string }[] = [];
    const openingHour = 7; // Corresponds to 7:00 AM UTC
    let dayClosingHour = 22; // Corresponds to 10:00 PM UTC
    const dateParts = this.selectedDateForTimeSlots.split('-').map(Number);
    const utcYear = dateParts[0], utcMonth = dateParts[1] - 1, utcDay = dateParts[2];
    
    const dayOfWeek = new Date(Date.UTC(utcYear, utcMonth, utcDay)).getUTCDay();

    // Sundays (0) are not reservable
    if (dayOfWeek === 0) { this.availableStartTimes = []; this.cdr.detectChanges(); return; } 
    // Saturdays (6) close at 12:00 PM UTC
    if (dayOfWeek === 6) dayClosingHour = 12; 

    const now = new Date(); // Local Date object
    // MODIFICACION AQUI: Obtener el timestamp UTC del momento actual
    // Esto asegura que la comparación se haga entre dos timestamps UTC
    const nowInUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());

    // *** AÑADIR ESTOS LOGS ANTES DEL BUCLE ***
    console.log(`--- DEBUG generateAvailableTimeSlots ---`);
    console.log(`Selected Date (YYYY-MM-DD UTC): ${this.selectedDateForTimeSlots}`);
    console.log(`Current Day of Week (0=Sun, 6=Sat): ${dayOfWeek}`);
    console.log(`Opening Hour (UTC): ${openingHour}`);
    console.log(`Calculated Day Closing Hour (UTC): ${dayClosingHour}`);
    console.log(`Current Time (Local): ${now.toString()}`);
    console.log(`Current Time (UTC Timestamp): ${new Date(nowInUTC).toISOString()}`); // Convert timestamp back to ISO for readability
    console.log(`Is selected date today?: ${new Date(Date.UTC(utcYear, utcMonth, utcDay)).getTime() === new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()}`);


    const existingReservationTimes = this.existingReservationsForDay.map(res => ({
      start: new Date(res.startTime + 'Z').getTime(), // Ensure UTC interpretation
      end: new Date(res.endTime + 'Z').getTime()
    }));
    console.log(`Existing Reservations for Day (UTC Timestamps and ISO strings):`);
    existingReservationTimes.forEach(res => {
        console.log(`  - Start: ${new Date(res.start).toISOString()}, End: ${new Date(res.end).toISOString()}`);
    });

    for (let hour = openingHour; hour < dayClosingHour; hour++) {
      for (let minute = 0; minute < 60; minute += this.SLOT_DURATION_MINUTES) {
        const slotStartUTC = new Date(Date.UTC(utcYear, utcMonth, utcDay, hour, minute));
        const slotStartTimestamp = slotStartUTC.getTime(); // This is UTC timestamp

        // *** AÑADIR ESTOS LOGS DENTRO DEL BUCLE ***
        console.log(`DEBUG: Loop - Processing slot: ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}, UTC ISO: ${slotStartUTC.toISOString()}`);
        console.log(`DEBUG: Filter Check - isSelectedDateTodayUTC: ${new Date(Date.UTC(utcYear, utcMonth, utcDay)).getTime() === new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()}, slotStartTimestamp (${slotStartTimestamp}) < nowInUTC (${nowInUTC}): ${slotStartTimestamp < nowInUTC}`);
        
        if (new Date(Date.UTC(utcYear, utcMonth, utcDay)).getTime() === new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime() && slotStartTimestamp < nowInUTC) {
            console.log(`DEBUG: FILTERED - Past time for today: ${slotStartUTC.toISOString()}`);
            continue;
        }

        const slotEndUTC = new Date(slotStartUTC.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);

        console.log(`DEBUG: Closing Hour Check - slotEndUTC.getUTCHours(): ${slotEndUTC.getUTCHours()}, dayClosingHour: ${dayClosingHour}`);
        if (slotEndUTC.getUTCHours() > dayClosingHour || 
           (slotEndUTC.getUTCHours() === dayClosingHour && slotEndUTC.getUTCMinutes() > 0)) {
           console.log(`DEBUG: FILTERED - Exceeds closing hour: ${slotEndUTC.toISOString()}`);
           continue; 
        }

        let isOccupied = false;
        for (const res of existingReservationTimes) {
          if (slotStartTimestamp < res.end && slotEndUTC.getTime() > res.start) {
            isOccupied = true; 
            break;
          }
        }
        if (isOccupied) {
            console.log(`DEBUG: FILTERED - Occupied by existing reservation. Slot: ${slotStartUTC.toISOString()}`);
            continue;
        }

        console.log(`DEBUG: ADDING SLOT: ${slotStartUTC.toISOString()}, Display: ${`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}`);
        slots.push({
          value: slotStartUTC.toISOString(),
          display: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        });
      }
    }
    this.availableStartTimes = slots;
    this.cdr.detectChanges();
    console.log(`--- END DEBUG generateAvailableTimeSlots ---`);
    console.log(`Final Available Slots:`, this.availableStartTimes);
  }

  onStartTimeSelected(selectedStartTimeISO_UTC: string | null) {
    if (this.isLoadingTimes || !selectedStartTimeISO_UTC) {
        this.reservationForm.get('durationBlocks')?.setValue(1, {emitEvent: true});
        return;
    };
    this.filterAvailableDurations(selectedStartTimeISO_UTC);
  }

  filterAvailableDurations(startTimeISO: string) {
    const dayOfWeek = new Date(startTimeISO).getUTCDay();
    const dayClosingHourUTC = (dayOfWeek === 6) ? 12 : 22; 

    this.filteredAvailableDurations = this.allAvailableDurations.filter(durationOption => {
        const totalDurationMinutes = durationOption.value * this.SLOT_DURATION_MINUTES;
        const potentialEndTimeUTC = new Date(new Date(startTimeISO).getTime() + totalDurationMinutes * 60 * 1000);

        if (potentialEndTimeUTC.getUTCHours() > dayClosingHourUTC || 
           (potentialEndTimeUTC.getUTCHours() === dayClosingHourUTC && potentialEndTimeUTC.getUTCMinutes() > 0)) {
            return false;
        }
        
        for (let i = 0; i < durationOption.value; i++) {
            const currentMiniBlockStart = new Date(new Date(startTimeISO).getTime() + i * this.SLOT_DURATION_MINUTES * 60 * 1000);
            const currentMiniBlockEnd = new Date(currentMiniBlockStart.getTime() + this.SLOT_DURATION_MINUTES * 60 * 1000);
            for (const res of this.existingReservationsForDay) {
                const resStartTime = new Date(res.startTime + 'Z').getTime();
                const resEndTime = new Date(res.endTime + 'Z').getTime();
                if (currentMiniBlockStart.getTime() < resEndTime && currentMiniBlockEnd.getTime() > resStartTime) {
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

    const startTimeUTC = new Date(startTimeISO);
    const totalDurationMinutes = durationBlocksValue * this.SLOT_DURATION_MINUTES;
    const endTimeUTC = new Date(startTimeUTC.getTime() + totalDurationMinutes * 60 * 1000);
    this.reservationForm.patchValue({ endTime: endTimeUTC.toISOString() }, { emitEvent: false });
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
        const startTimeUTC = new Date(res.startTime + 'Z');
        const endTimeUTC = new Date(res.endTime + 'Z');
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
            startTime: res.startTime.endsWith('Z') ? res.startTime : res.startTime + 'Z',
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