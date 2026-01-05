import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // <--- IMPORTANTE
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms'; // <--- IMPORTANTE
import { IonicModule, ToastController } from '@ionic/angular'; // <--- IMPORTANTE
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from 'src/app/services/reservation.service';
import { ClassroomService } from 'src/app/services/classroom.service';
import { UserService } from 'src/app/services/user.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-reservation-form',
  templateUrl: './reservation-form.page.html',
  styleUrls: ['./reservation-form.page.scss'],
  standalone: true, // <--- CONFIRMA QUE ES STANDALONE
  imports: [IonicModule, CommonModule, ReactiveFormsModule, FormsModule] // <--- SOLUCIÓN A TUS ERRORES DE HTML
})
export class ReservationFormPage implements OnInit {
  reservationForm: FormGroup;
  isEditMode = false;
  reservationId: string | null = null;

  classrooms: any[] = [];
  users: any[] = [];

  isAdminOrCoordinator = false;
  reservationType: 'single' | 'semester' = 'single';

  daysOfWeek = [
    { value: 'MONDAY', label: 'Lunes' },
    { value: 'TUESDAY', label: 'Martes' },
    { value: 'WEDNESDAY', label: 'Miércoles' },
    { value: 'THURSDAY', label: 'Jueves' },
    { value: 'FRIDAY', label: 'Viernes' },
    { value: 'SATURDAY', label: 'Sábado' },
    { value: 'SUNDAY', label: 'Domingo' }
  ];

  constructor(
    private fb: FormBuilder,
    private reservationService: ReservationService,
    private classroomService: ClassroomService,
    private userService: UserService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private toastController: ToastController
  ) {
    this.reservationForm = this.fb.group({
      classroomId: ['', Validators.required],
      userId: [''],
      purpose: ['', Validators.required],
      startTime: ['', Validators.required],
      endTime: ['', Validators.required],
      date: [new Date().toISOString()],
      semesterStartDate: [''],
      semesterEndDate: [''],
      dayOfWeek: ['']
    });
  }

  ngOnInit() {
    this.loadClassrooms();
    this.checkUserRole();

    this.reservationId = this.route.snapshot.paramMap.get('id');
    if (this.reservationId) {
      this.isEditMode = true;
      this.loadReservation(this.reservationId);
    }
  }

  checkUserRole() {
    // Suscribirse al rol actual del usuario
    this.authService.getUserRole().subscribe(role => {
      this.isAdminOrCoordinator = (role === 'ADMIN' || role === 'COORDINADOR');
      if (this.isAdminOrCoordinator) {
        this.loadUsers();
      }
    });
  }

  segmentChanged(ev: any) {
    this.reservationType = ev.detail.value;
  }

  loadClassrooms() {
    // Usamos getAllClassrooms que es el método común
    this.classroomService.getAllClassrooms().subscribe(data => this.classrooms = data);
  }

  loadUsers() {
    this.userService.getAllUsers().subscribe(data => this.users = data);
  }

  loadReservation(id: string) {
    this.reservationService.getReservationById(id).subscribe((data: any) => {
      this.reservationForm.patchValue({
        classroomId: data.classroom?.id,
        userId: data.user?.id,
        purpose: data.purpose,
        startTime: data.startTime, // Ajustar si viene formato completo
        endTime: data.endTime
      });
    });
  }

  async onSubmit() {
    if (this.reservationForm.invalid) {
      this.reservationForm.markAllAsTouched();
      return;
    }

    const formValue = this.reservationForm.value;

    if (this.reservationType === 'single' || this.isEditMode) {
        // Lógica Reserva Única
        const datePart = formValue.date.split('T')[0];
        const startTimePart = (formValue.startTime.includes('T')) ? formValue.startTime.split('T')[1] : formValue.startTime;
        const endTimePart = (formValue.endTime.includes('T')) ? formValue.endTime.split('T')[1] : formValue.endTime;

        // Asegurar formato limpio HH:mm:ss si es necesario
        const cleanStart = startTimePart.length > 8 ? startTimePart.substring(0,8) : startTimePart;
        const cleanEnd = endTimePart.length > 8 ? endTimePart.substring(0,8) : endTimePart;

        const payload = {
            classroomId: formValue.classroomId,
            userId: formValue.userId,
            purpose: formValue.purpose,
            startTime: `${datePart}T${cleanStart}`,
            endTime: `${datePart}T${cleanEnd}`,
            status: 'PENDIENTE'
        };

        if (this.isEditMode && this.reservationId) {
            this.reservationService.updateReservation(this.reservationId, payload).subscribe({
                next: () => this.handleSuccess('Reserva actualizada'),
                error: (err) => this.handleError(err)
            });
        } else {
            this.reservationService.createReservation(payload).subscribe({
                next: () => this.handleSuccess('Reserva creada'),
                error: (err) => this.handleError(err)
            });
        }

    } else {
        // Lógica Semestre
        if (!formValue.semesterStartDate || !formValue.semesterEndDate || !formValue.dayOfWeek) {
            this.showToast('Faltan datos del semestre');
            return;
        }

        const cleanStartTime = (formValue.startTime.includes('T')) ? formValue.startTime.split('T')[1].substring(0, 8) : formValue.startTime;
        const cleanEndTime = (formValue.endTime.includes('T')) ? formValue.endTime.split('T')[1].substring(0, 8) : formValue.endTime;

        const semesterPayload = {
            classroomId: formValue.classroomId,
            professorId: formValue.userId,
            semesterStartDate: formValue.semesterStartDate.split('T')[0],
            semesterEndDate: formValue.semesterEndDate.split('T')[0],
            dayOfWeek: formValue.dayOfWeek,
            startTime: cleanStartTime,
            endTime: cleanEndTime,
            purpose: formValue.purpose
        };

        this.reservationService.createSemesterReservation(semesterPayload).subscribe({
            next: () => this.handleSuccess('Semestre asignado correctamente'),
            error: (err) => this.handleError(err)
        });
    }
  }

  async handleSuccess(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: 'success'
    });
    toast.present();
    this.router.navigate(['/reservations']);
  }

  async handleError(error: any) {
    console.error(error);
    const msg = error.error?.message || 'Error al procesar la solicitud';
    this.showToast(msg, 'danger');
  }

  async showToast(msg: string, color: string = 'warning') {
    const toast = await this.toastController.create({
      message: msg,
      duration: 3000,
      color: color
    });
    toast.present();
  }
}
