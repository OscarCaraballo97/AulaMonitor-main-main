import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { IonicModule, ToastController, LoadingController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from 'src/app/services/reservation.service';
import { ClassroomService } from 'src/app/services/classroom.service';
import { UserService } from 'src/app/services/user.service';
import { AuthService } from 'src/app/services/auth.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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

    this.reservationForm.get('classroomId')?.valueChanges.subscribe(() => { if(!this.isLoadingAvailability) this.loadDayReservations(); });
    this.reservationForm.get('date')?.valueChanges.subscribe(() => { if(this.reservationType === 'single') this.loadDayReservations(); });
  }

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

  loadReservation(id: string) {
    this.isLoadingAvailability = true;
    this.reservationService.getReservationById(id).subscribe({
        next: (data: any) => {
            this.reservationType = 'single';
            const startDateObj = new Date(data.startTime);
            const dateISO = startDateObj.toISOString();

            this.reservationForm.patchValue({
                classroomId: data.classroom?.id,
                userId: data.user?.id,
                purpose: data.purpose,
                startTime: data.startTime,
                endTime: data.endTime,
                date: dateISO,
                semesterStartDate: null,
                semesterEndDate: null,
                dayOfWeek: []
            });
            this.loadDayReservations(true);
        },
        error: (err) => {
            this.isLoadingAvailability = false;
            this.showAlert('Error', 'No se pudo cargar la reserva.');
            this.router.navigate(['/app/reservations']);
        }
    });
  }

  initTimeSlots() {
    const slots: TimeSlot[] = [];
    const formDate = this.reservationForm.get('date')?.value;
    const baseDate = formDate ? new Date(formDate) : new Date();
    const dayOfWeek = baseDate.getDay();
    let closingHour = 22;
    if (this.reservationType === 'single') {
        if (dayOfWeek === 0) {
            this.timeSlots = [];
            this.reservationForm.patchValue({ startTime: null, endTime: null });
            return;
        }
        if (dayOfWeek === 6) closingHour = 12;
    }
    let pointer = new Date(baseDate);
    pointer.setHours(6, 0, 0, 0);
    const endLimit = new Date(baseDate);
    endLimit.setHours(closingHour, 0, 0, 0);
    let idx = 0;
    while (pointer < endLimit) {
      const sStart = new Date(pointer);
      const sEnd = new Date(pointer.getTime() + 45 * 60000);
      if (sEnd > endLimit && sEnd.getHours() !== closingHour) break;
      if (closingHour === 12 && (sEnd.getHours() > 12 || (sEnd.getHours() === 12 && sEnd.getMinutes() > 0))) break;
      slots.push({
        index: idx++,
        startLabel: `${sStart.getHours().toString().padStart(2,'0')}:${sStart.getMinutes().toString().padStart(2,'0')}`,
        endLabel: `${sEnd.getHours().toString().padStart(2,'0')}:${sEnd.getMinutes().toString().padStart(2,'0')}`,
        startISO: sStart.toISOString(),
        endISO: sEnd.toISOString(),
        status: 'free'
      });
      pointer = sEnd;
    }
    this.timeSlots = slots;
  }

  loadDayReservations(isEditLoad: boolean = false) {
    if (this.reservationType === 'semester') {
        this.initTimeSlots();
        this.currentDayReservations = [];
        return;
    }
    const cid = this.reservationForm.get('classroomId')?.value;
    const dateVal = this.reservationForm.get('date')?.value;
    if (!cid || !dateVal) { this.initTimeSlots(); return; }
    this.initTimeSlots();
    if (this.timeSlots.length === 0) { this.currentDayReservations = []; return; }
    this.isLoadingAvailability = true;
    const d = new Date(dateVal);
    const startIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const endIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    this.classroomService.getClassroomReservations(cid, startIso, endIso).subscribe({
      next: (res) => {
          this.currentDayReservations = res;
          this.updateVisualGrid();
          if (isEditLoad) this.restoreSelectionFromForm();
          this.isLoadingAvailability = false;
      },
      error: () => { this.isLoadingAvailability = false; }
    });
  }

  restoreSelectionFromForm() {
      const startVal = this.reservationForm.get('startTime')?.value;
      const endVal = this.reservationForm.get('endTime')?.value;
      if (startVal && endVal) {
          const startTime = new Date(startVal).getTime();
          const endTime = new Date(endVal).getTime();
          const startSlot = this.timeSlots.find(s => new Date(s.startISO).getTime() === startTime);
          const endSlot = this.timeSlots.find(s => new Date(s.endISO).getTime() === endTime);
          if (startSlot) {
              this.selectionStartIndex = startSlot.index;
              this.selectionEndIndex = endSlot ? endSlot.index : startSlot.index;
              this.updateVisualGrid();
          }
      }
  }

  selectSlot(slot: TimeSlot) {
    if (slot.status === 'busy') { this.showToast('Horario no disponible', 'warning'); return; }
    if (this.selectionStartIndex === null || (this.selectionStartIndex !== null && this.selectionEndIndex !== null)) {
      this.selectionStartIndex = slot.index; this.selectionEndIndex = null;
    } else {
      if (slot.index < this.selectionStartIndex) { this.selectionStartIndex = slot.index; this.selectionEndIndex = null; }
      else {
        if (this.isRangeFree(this.selectionStartIndex, slot.index)) this.selectionEndIndex = slot.index;
        else this.showToast('El rango choca con otra reserva.', 'danger');
      }
    }
    this.updateVisualGrid(); this.updateFormValues();
  }

  isRangeFree(start: number, end: number): boolean {
    for (let i = start; i <= end; i++) if (this.timeSlots[i].status === 'busy') return false;
    return true;
  }

  updateVisualGrid() {
    const now = new Date();
    this.timeSlots.forEach(slot => {
      let isBlocked = false;
      const sStart = new Date(slot.startISO).getTime();
      const sEnd = new Date(slot.endISO).getTime();
      if (this.reservationType === 'single' && this.currentDayReservations.some(r => {
         if (this.isEditMode && r.id === this.reservationId) return false;
         return (new Date(r.startTime).getTime() < sEnd && new Date(r.endTime).getTime() > sStart);
      })) isBlocked = true;
      if (this.reservationType === 'single' && new Date(slot.startISO) < now) isBlocked = true;
      slot.status = isBlocked ? 'busy' : 'free';
    });
    if (this.selectionStartIndex !== null) {
      if (this.selectionEndIndex === null) this.timeSlots[this.selectionStartIndex].status = 'range-start';
      else {
        for (let i = this.selectionStartIndex; i <= this.selectionEndIndex; i++) {
           this.timeSlots[i].status = (i === this.selectionStartIndex) ? 'range-start' : (i === this.selectionEndIndex ? 'range-end' : 'selected');
        }
      }
    }
  }

  updateFormValues() {
    if (this.selectionStartIndex !== null) {
      this.reservationForm.patchValue({
        startTime: this.timeSlots[this.selectionStartIndex].startISO,
        endTime: this.selectionEndIndex !== null ? this.timeSlots[this.selectionEndIndex].endISO : this.timeSlots[this.selectionStartIndex].endISO
      });
    } else { this.reservationForm.patchValue({ startTime: null, endTime: null }); }
  }

  async onSubmit() {
    if (this.reservationForm.invalid) {
        this.reservationForm.markAllAsTouched();
        return;
    }
    const val = this.reservationForm.value;

    const formatToLocalISO = (isoString: string) => {
      if (!isoString) return null;
      const d = new Date(isoString);
      const pad = (n: number) => n < 10 ? '0' + n : n;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    const getLocalTimeString = (iso: string) => {
        const d = new Date(iso);
        const pad = (n: number) => n < 10 ? '0' + n : n;
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const loading = await this.loadingCtrl.create({ message: 'Procesando...' });

    // --- MODO EDICIÓN ---
    if (this.isEditMode && this.reservationId) {
        const alert = await this.alertController.create({
            header: 'Editar Reserva',
            message: '¿Deseas modificar solo esta reserva o toda la serie del semestre (clases futuras)?',
            buttons: [
                { text: 'Cancelar', role: 'cancel' },
                {
                    text: 'Solo esta',
                    handler: async () => {
                        await loading.present();
                        const payload = {
                            ...val,
                            startTime: formatToLocalISO(val.startTime),
                            endTime: formatToLocalISO(val.endTime),
                            status: 'PENDIENTE'
                        };
                        this.reservationService.updateReservation(this.reservationId!, payload).subscribe({
                            next: () => { loading.dismiss(); this.handleSuccess('Reserva actualizada.'); },
                            error: (e) => { loading.dismiss(); this.showAlert('Error', e.message); }
                        });
                    }
                },
                {
                    text: 'Todo el semestre',
                    handler: async () => {
                        await loading.present();
                        const payload = {
                            ...val,
                            startTime: formatToLocalISO(val.startTime),
                            endTime: formatToLocalISO(val.endTime),
                            status: 'PENDIENTE'
                        };
                        this.reservationService.updateSemesterReservation(this.reservationId!, payload).subscribe({
                            next: () => { loading.dismiss(); this.handleSuccess('Serie actualizada correctamente.'); },
                            error: (e) => { loading.dismiss(); this.showAlert('Error', e.message); }
                        });
                    }
                }
            ]
        });
        await alert.present();
        return;
    }

    // --- MODO CREACIÓN ---
    await loading.present();
    if (this.reservationType === 'single') {
       const payload = {
           ...val,
           startTime: formatToLocalISO(val.startTime),
           endTime: formatToLocalISO(val.endTime),
           status: 'PENDIENTE'
       };
       this.reservationService.createReservation(payload).subscribe({
           next:() => { loading.dismiss(); this.handleSuccess('Reserva creada.'); },
           error:(e) => { loading.dismiss(); this.showAlert('Error', e.message); }
       });
    } else {
       const selectedDays = Array.isArray(val.dayOfWeek) ? val.dayOfWeek : [val.dayOfWeek];
       if (!selectedDays || selectedDays.length === 0) { loading.dismiss(); this.showToast('Seleccione un día', 'warning'); return; }
       const endDateLocal = new Date(val.endTime);
       if (selectedDays.includes('SATURDAY') && (endDateLocal.getHours() > 12 || (endDateLocal.getHours() === 12 && endDateLocal.getMinutes() > 0))) {
           loading.dismiss(); this.showAlert('Horario no permitido', 'Sábado cierra a las 12:00 PM.'); return;
       }
       const requests = selectedDays.map((day: string) => {
           const payload = {
               classroomId: val.classroomId,
               professorId: val.userId,
               semesterStartDate: val.semesterStartDate.split('T')[0],
               semesterEndDate: val.semesterEndDate.split('T')[0],
               startTime: getLocalTimeString(val.startTime),
               endTime: getLocalTimeString(val.endTime),
               purpose: val.purpose,
               dayOfWeek: day
           };
           return this.reservationService.createSemesterReservation(payload).pipe(catchError(err => of({ error: true, message: err.message })));
       });
       forkJoin(requests).subscribe((results: any[]) => {
           loading.dismiss();
           const errors = results.filter(r => r.error);
           if (errors.length > 0) { const msgList = errors.map(e => `• ${e.message}`).join('\n'); this.showAlert('Conflictos', `Algunas reservas fallaron:\n\n${msgList}`); }
           else { this.handleSuccess('Semestre creado correctamente.'); }
       });
    }
  }

  async handleSuccess(m:string) {
      const t = await this.toastController.create({ message: m, duration: 2000, color: 'success' });
      await t.present();
      setTimeout(() => { this.router.navigate(['/app/reservations']); }, 300);
  }

  async showAlert(header: string, message: string) {
    const alert = await this.alertController.create({ header, message, buttons: ['OK'], cssClass: 'custom-alert-message' });
    await alert.present();
  }

  async handleError(e:any) { this.showAlert('Error', e.message||'Error desconocido'); }
  async showToast(m:string, c:string, d:number = 3000) { (await this.toastController.create({message:m,duration:d,color:c})).present(); }
}
