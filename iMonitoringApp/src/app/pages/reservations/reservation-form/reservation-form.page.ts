import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from 'src/app/services/reservation.service';
import { ClassroomService } from 'src/app/services/classroom.service';
import { UserService } from 'src/app/services/user.service';
import { AuthService } from 'src/app/services/auth.service';
import { Reservation } from 'src/app/models/reservation.model';

interface TimeSlot {
  index: number;
  startLabel: string;
  endLabel: string;
  startISO: string;
  endISO: string;
  status: 'free' | 'busy' | 'selected' | 'range-start' | 'range-end';
}

@Component({
  selector: 'app-reservation-form',
  templateUrl: './reservation-form.page.html',
  styleUrls: ['./reservation-form.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule, FormsModule]
})
export class ReservationFormPage implements OnInit {
  reservationForm: FormGroup;
  isEditMode = false;
  reservationId: string | null = null;
  currentGroupId: string | null = null;

  classrooms: any[] = [];
  users: any[] = [];

  isAdminOrCoordinator = false;
  reservationType: 'single' | 'semester' = 'single';

  timeSlots: TimeSlot[] = [];
  currentDayReservations: any[] = [];
  isLoadingAvailability = false;

  selectionStartIndex: number | null = null;
  selectionEndIndex: number | null = null;

  minDateISO = new Date().toISOString();

  // Configuración para que el texto de los selectores sea blanco (usa la clase en global.scss)
  customAlertOptions = {
    cssClass: 'white-text-alert'
  };

  daysOfWeek = [
    { value: 'MONDAY', label: 'Lunes' },
    { value: 'TUESDAY', label: 'Martes' },
    { value: 'WEDNESDAY', label: 'Miércoles' },
    { value: 'THURSDAY', label: 'Jueves' },
    { value: 'FRIDAY', label: 'Viernes' },
    { value: 'SATURDAY', label: 'Sábado' }
  ];

  constructor(
    private fb: FormBuilder,
    private reservationService: ReservationService,
    private classroomService: ClassroomService,
    private userService: UserService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private toastController: ToastController,
    private loadingCtrl: LoadingController,
    private alertController: AlertController
  ) {
    this.reservationForm = this.fb.group({
      classroomId: ['', Validators.required],
      userId: [''],
      purpose: ['', Validators.required],
      startTime: [null, Validators.required],
      endTime: [null, Validators.required],
      date: [new Date().toISOString()],
      semesterStartDate: [null],
      semesterEndDate: [null],
      dayOfWeek: [[]]
    });
  }

  ngOnInit() {
    this.checkUserRole();
    this.loadClassrooms();
    this.initTimeSlots();

    this.reservationId = this.route.snapshot.paramMap.get('id');
    if (this.reservationId) {
      this.isEditMode = true;
      this.loadReservation(this.reservationId);
    } else {
      this.loadDayReservations();
    }

    this.reservationForm.get('classroomId')?.valueChanges.subscribe(() => { 
      if (!this.isLoadingAvailability) this.loadDayReservations(); 
    });
    this.reservationForm.get('date')?.valueChanges.subscribe(() => {
      if (this.reservationType === 'single') this.loadDayReservations();
    });
  }

  // --- MÉTODOS DE SOPORTE ---

  checkUserRole() {
    this.authService.getUserRole().subscribe(role => {
      this.isAdminOrCoordinator = (role === 'ADMIN' || role === 'COORDINADOR');
      if (!this.isAdminOrCoordinator) {
        this.reservationType = 'single';
        this.reservationForm.patchValue({ semesterStartDate: null, semesterEndDate: null, dayOfWeek: [] });
      } else {
        this.loadUsers();
      }
    });
  }

  segmentChanged(ev: any) {
    if (!this.isAdminOrCoordinator && ev.detail.value === 'semester') {
      this.reservationType = 'single';
      return;
    }
    this.reservationType = ev.detail.value;
    this.initTimeSlots();
  }

  loadClassrooms() { this.classroomService.getAllClassrooms().subscribe(data => this.classrooms = data); }
  loadUsers() { this.userService.getAllUsers().subscribe(data => this.users = data); }

  // Resto de la lógica de carga y visualización de slots (mantener igual que tu original)
  loadReservation(id: string) {
    this.isLoadingAvailability = true;
    this.reservationService.getReservationById(id).subscribe({
      next: (data: Reservation) => {
        this.currentGroupId = data.groupId || null;
        this.reservationType = this.currentGroupId ? 'semester' : 'single';
        const startDateObj = new Date(data.startTime);
        this.reservationForm.patchValue({
          classroomId: data.classroom?.id,
          userId: data.user?.id,
          purpose: data.purpose,
          startTime: data.startTime,
          endTime: data.endTime,
          date: startDateObj.toISOString(),
        });
        this.loadDayReservations(true);
      },
      error: () => {
        this.isLoadingAvailability = false;
        this.showAlert('Error', 'No se pudo cargar la reserva.');
        this.router.navigate(['/app/reservations']);
      }
    });
  }

  initTimeSlots() {
    const slots: TimeSlot[] = [];
    const formDateVal = this.reservationForm.get('date')?.value;
    let baseDate = formDateVal ? new Date(formDateVal) : new Date();
    baseDate.setHours(0, 0, 0, 0);

    const dayOfWeek = baseDate.getDay();
    let closingHour = (this.reservationType === 'single' && dayOfWeek === 6) ? 12 : 22;

    if (this.reservationType === 'single' && dayOfWeek === 0) {
      this.timeSlots = [];
      return;
    }

    let pointer = new Date(baseDate);
    pointer.setHours(6, 0, 0, 0);
    const endLimit = new Date(baseDate);
    endLimit.setHours(closingHour, 0, 0, 0);

    let idx = 0;
    while (pointer < endLimit) {
      const sStart = new Date(pointer);
      const sEnd = new Date(pointer.getTime() + 45 * 60000);
      if (sEnd > endLimit) break;

      slots.push({
        index: idx++,
        startLabel: this.formatTime(sStart),
        endLabel: this.formatTime(sEnd),
        startISO: sStart.toISOString(),
        endISO: sEnd.toISOString(),
        status: 'free'
      });
      pointer = sEnd;
    }
    this.timeSlots = slots;
  }

  formatTime(date: Date): string {
    return date.toTimeString().substring(0, 5);
  }

  loadDayReservations(isEditLoad: boolean = false) {
    if (this.reservationType === 'semester' && !this.isEditMode) {
      this.initTimeSlots();
      this.currentDayReservations = [];
      return;
    }
    const cid = this.reservationForm.get('classroomId')?.value;
    const dateVal = this.reservationForm.get('date')?.value;
    if (!cid || !dateVal) { this.initTimeSlots(); return; }

    this.initTimeSlots();
    this.isLoadingAvailability = true;
    const d = new Date(dateVal);
    const startIso = new Date(d.setHours(0,0,0,0)).toISOString();
    const endIso = new Date(d.setHours(23,59,59,999)).toISOString();

    this.classroomService.getClassroomReservations(cid, startIso, endIso).subscribe({
      next: (res) => {
        this.currentDayReservations = res;
        this.updateVisualGrid();
        if (isEditLoad) this.restoreSelectionFromForm();
        this.isLoadingAvailability = false;
      },
      error: () => this.isLoadingAvailability = false
    });
  }

  // --- MANEJO DE SELECCIÓN Y SUBMIT ---
  // (Mantener tus métodos updateVisualGrid, selectSlot, updateFormValues y onSubmit tal cual los tienes)

  updateVisualGrid() {
    const now = new Date();
    this.timeSlots.forEach(slot => {
      let isBlocked = false;
      const sStart = new Date(slot.startISO).getTime();
      const sEnd = new Date(slot.endISO).getTime();

      if (this.currentDayReservations.some(r => {
        if (this.isEditMode && r.id === this.reservationId) return false;
        return (new Date(r.startTime).getTime() < sEnd && new Date(r.endTime).getTime() > sStart);
      })) isBlocked = true;

      if (this.reservationType === 'single' && sStart < now.getTime() && new Date(slot.startISO).toDateString() === now.toDateString()) isBlocked = true;
      slot.status = isBlocked ? 'busy' : 'free';
    });

    if (this.selectionStartIndex !== null) {
      const end = this.selectionEndIndex ?? this.selectionStartIndex;
      for (let i = this.selectionStartIndex; i <= end; i++) {
        if (this.timeSlots[i].status !== 'busy') {
          this.timeSlots[i].status = (i === this.selectionStartIndex) ? 'range-start' : (i === end ? 'range-end' : 'selected');
        }
      }
    }
  }

  selectSlot(slot: TimeSlot) {
    if (slot.status === 'busy') { this.showToast('Horario no disponible', 'warning'); return; }
    if (this.selectionStartIndex === null || this.selectionEndIndex !== null) {
      this.selectionStartIndex = slot.index; this.selectionEndIndex = null;
    } else {
      if (slot.index < this.selectionStartIndex) { this.selectionStartIndex = slot.index; }
      else if (this.isRangeFree(this.selectionStartIndex, slot.index)) { this.selectionEndIndex = slot.index; }
      else { this.showToast('El rango choca con otra reserva.', 'danger'); }
    }
    this.updateVisualGrid(); this.updateFormValues();
  }

  isRangeFree = (s: number, e: number) => this.timeSlots.slice(s, e + 1).every(slot => slot.status !== 'busy');

  updateFormValues() {
    if (this.selectionStartIndex !== null) {
      this.reservationForm.patchValue({
        startTime: this.timeSlots[this.selectionStartIndex].startISO,
        endTime: this.timeSlots[this.selectionEndIndex ?? this.selectionStartIndex].endISO
      });
    }
  }

  restoreSelectionFromForm() {
    const startVal = this.reservationForm.get('startTime')?.value;
    const endVal = this.reservationForm.get('endTime')?.value;
    if (startVal && endVal) {
      const startSlot = this.timeSlots.find(s => new Date(s.startISO).getTime() === new Date(startVal).getTime());
      const endSlot = this.timeSlots.find(s => new Date(s.endISO).getTime() === new Date(endVal).getTime());
      if (startSlot) {
        this.selectionStartIndex = startSlot.index;
        this.selectionEndIndex = endSlot ? endSlot.index : null;
        this.updateVisualGrid();
      }
    }
  }

  async onSubmit() {
    if (this.reservationForm.invalid) { this.reservationForm.markAllAsTouched(); return; }
    const val = this.reservationForm.value;
    const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
    await loading.present();

    const formatToLocalISO = (iso: string) => iso ? iso.split('.')[0] : null;

    if (this.isEditMode) {
      this.reservationService.updateReservation(this.reservationId!, { ...val, startTime: formatToLocalISO(val.startTime), endTime: formatToLocalISO(val.endTime) }, !!this.currentGroupId)
        .subscribe({ next: () => { loading.dismiss(); this.handleSuccess('Reserva actualizada'); }, error: (e) => { loading.dismiss(); this.showAlert('Error', e.message); } });
    } else {
      if (this.reservationType === 'single') {
        this.reservationService.createReservation({ ...val, startTime: formatToLocalISO(val.startTime), endTime: formatToLocalISO(val.endTime), status: 'PENDIENTE' })
          .subscribe({ next: () => { loading.dismiss(); this.handleSuccess('Reserva creada'); }, error: (e) => { loading.dismiss(); this.showAlert('Error', e.message); } });
      } else {
        const payload = {
          classroomId: val.classroomId, professorId: val.userId,
          semesterStartDate: val.semesterStartDate.split('T')[0], semesterEndDate: val.semesterEndDate.split('T')[0],
          startTime: new Date(val.startTime).toTimeString().split(' ')[0], endTime: new Date(val.endTime).toTimeString().split(' ')[0],
          purpose: val.purpose, daysOfWeek: val.dayOfWeek
        };
        this.reservationService.createSemesterReservation(payload).subscribe({
          next: () => { loading.dismiss(); this.handleSuccess('Semestre creado'); },
          error: (e) => { loading.dismiss(); this.showAlert('Error', e.message); }
        });
      }
    }
  }

  // --- UTILIDADES ---
  async handleSuccess(m: string) {
    const t = await this.toastController.create({ message: m, duration: 2000, color: 'success' });
    await t.present();
    this.router.navigate(['/app/reservations']);
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({ header, message, buttons: ['OK'], cssClass: 'custom-alert-message' });
    await alert.present();
  }

  async showToast(m: string, c: string) { (await this.toastController.create({ message: m, duration: 3000, color: c })).present(); }
}
