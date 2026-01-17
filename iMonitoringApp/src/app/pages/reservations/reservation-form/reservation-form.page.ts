import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from 'src/app/services/reservation.service';
import { ClassroomService } from 'src/app/services/classroom.service';
import { UserService } from 'src/app/services/user.service';
import { AuthService } from 'src/app/services/auth.service';

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

  daysOfWeek = [
    { value: 'MONDAY', label: 'Lunes' }, { value: 'TUESDAY', label: 'Martes' },
    { value: 'WEDNESDAY', label: 'Miércoles' }, { value: 'THURSDAY', label: 'Jueves' },
    { value: 'FRIDAY', label: 'Viernes' }, { value: 'SATURDAY', label: 'Sábado' },
    { value: 'SUNDAY', label: 'Domingo' }
  ];

  constructor(
    private fb: FormBuilder, private reservationService: ReservationService,
    private classroomService: ClassroomService, private userService: UserService,
    private authService: AuthService, private route: ActivatedRoute,
    private router: Router, private toastController: ToastController
  ) {
    this.reservationForm = this.fb.group({
      classroomId: ['', Validators.required], userId: [''], purpose: ['', Validators.required],
      startTime: [null, Validators.required], endTime: [null, Validators.required],
      date: [new Date().toISOString()], semesterStartDate: [null], semesterEndDate: [null], dayOfWeek: ['']
    });
  }

  ngOnInit() {
    this.loadClassrooms();
    this.checkUserRole();
    this.initTimeSlots();
    this.reservationId = this.route.snapshot.paramMap.get('id');
    if (this.reservationId) { this.isEditMode = true; this.loadReservation(this.reservationId); }
    else { this.loadDayReservations(); }
    this.reservationForm.get('classroomId')?.valueChanges.subscribe(() => this.loadDayReservations());
    this.reservationForm.get('date')?.valueChanges.subscribe(() => this.loadDayReservations());
  }

  checkUserRole() {
    this.authService.getUserRole().subscribe(role => {
      this.isAdminOrCoordinator = (role === 'ADMIN' || role === 'COORDINADOR');
      if (this.isAdminOrCoordinator) this.loadUsers();
    });
  }

  segmentChanged(ev: any) { this.reservationType = ev.detail.value; }
  loadClassrooms() { this.classroomService.getAllClassrooms().subscribe(data => this.classrooms = data); }
  loadUsers() { this.userService.getAllUsers().subscribe(data => this.users = data); }

  loadReservation(id: string) {
    this.reservationService.getReservationById(id).subscribe((data: any) => {
      this.reservationForm.patchValue({
        classroomId: data.classroom?.id, userId: data.user?.id, purpose: data.purpose,
        startTime: data.startTime, endTime: data.endTime, date: data.startTime
      });
      this.loadDayReservations();
    });
  }

  initTimeSlots() {
    const slots: TimeSlot[] = [];
    const baseDate = new Date(this.reservationForm.get('date')?.value || new Date());
    const dayOfWeek = baseDate.getDay();

    if (dayOfWeek === 0) { // Domingo cerrado
      this.timeSlots = [];
      this.reservationForm.patchValue({ startTime: null, endTime: null });
      return;
    }

    let closingHour = (dayOfWeek === 6) ? 12 : 22; // Sábado 12pm, otros 22pm

    let pointer = new Date(baseDate);
    pointer.setHours(6, 0, 0, 0);
    const endLimit = new Date(baseDate);
    endLimit.setHours(closingHour, 0, 0, 0);

    let idx = 0;
    while (pointer < endLimit) {
      const sStart = new Date(pointer);
      const sEnd = new Date(pointer.getTime() + 45 * 60000);
      if (sEnd > endLimit && sEnd.getHours() !== closingHour) break;

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

  loadDayReservations() {
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
      next: (res) => { this.currentDayReservations = res; this.updateVisualGrid(); this.isLoadingAvailability = false; },
      error: () => { this.isLoadingAvailability = false; }
    });
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
      if (this.currentDayReservations.some(r => {
         if (this.isEditMode && r.id === this.reservationId) return false;
         return (new Date(r.startTime).getTime() < sEnd && new Date(r.endTime).getTime() > sStart);
      })) isBlocked = true;

      // Bloquear horas pasadas para single day
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
    if (this.reservationForm.invalid) return;
    const val = this.reservationForm.value;

    // Formatear a hora local ISO
    const formatToLocalISO = (isoString: string) => {
      if (!isoString) return null;
      const d = new Date(isoString);
      const pad = (n: number) => n < 10 ? '0' + n : n;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const exTime = (v:string)=>v.split('T')[1].substring(0,8);

    if (this.reservationType === 'single' || this.isEditMode) {
       const payload = {
           ...val,
           startTime: formatToLocalISO(val.startTime),
           endTime: formatToLocalISO(val.endTime),
           status: 'PENDIENTE'
       };
       const req = (this.isEditMode && this.reservationId) ? this.reservationService.updateReservation(this.reservationId, payload) : this.reservationService.createReservation(payload);
       req.subscribe({ next:()=>this.handleSuccess('Reserva guardada'), error:(e)=>this.handleError(e)});
    } else {
       const payload = {
           ...val,
           semesterStartDate: val.semesterStartDate.split('T')[0],
           semesterEndDate: val.semesterEndDate.split('T')[0],
           startTime: exTime(val.startTime),
           endTime: exTime(val.endTime)
       };
       this.reservationService.createSemesterReservation(payload).subscribe({ next:()=>this.handleSuccess('Semestre asignado'), error:(e)=>this.handleError(e)});
    }
  }

  async handleSuccess(m:string) {
    const t=await this.toastController.create({message:m,duration:2000,color:'success'});
    t.present();
    this.router.navigate(['/reservations/my-list']);
  }

  async handleError(e:any) { this.showToast(e.error?.message||'Error', 'danger'); }
  async showToast(m:string, c:string) { (await this.toastController.create({message:m,duration:3000,color:c})).present(); }
}
