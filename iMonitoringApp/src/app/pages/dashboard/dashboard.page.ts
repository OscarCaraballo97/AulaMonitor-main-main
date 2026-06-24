import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ToastController, AlertController, LoadingController, PopoverController } from '@ionic/angular/standalone';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Rol } from '../../models/rol.model';
import { User } from '../../models/user.model';
import { BuildingService } from '../../services/building.service';
import { ReservationService } from '../../services/reservation.service';
import { ClassroomService, ClassroomAvailabilitySummaryDTO } from '../../services/classroom.service';
import { Reservation, ReservationStatus } from '../../models/reservation.model';
import { Subject, combineLatest, forkJoin, of } from 'rxjs';
import { takeUntil, map, catchError, filter, finalize } from 'rxjs/operators';
import { PdfService } from '../../services/pdf.service';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
  IonSpinner, IonList, IonItem, IonLabel, IonBadge
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule, RouterModule, TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
    IonSpinner, IonList, IonItem, IonLabel, IonBadge
  ],
  providers: [DatePipe, PopoverController]
})
export class DashboardPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  userRole: Rol | null = null;
  currentUser: User | null = null;
  isLoadingRole = true;
  isLoadingData = false;

  totalBuildings: number | string = '-';
  classroomAvailability: ClassroomAvailabilitySummaryDTO | null = null;
  reservationsToApprove: Reservation[] = [];
  isLoadingReservationsToApprove = false;

  myUpcomingReservations: Reservation[] = [];
  isLoadingMyReservations = false;

  public RolEnum = Rol;
  public ReservationStatusEnum = ReservationStatus;

  constructor(
    private authService: AuthService,
    private buildingService: BuildingService,
    private reservationService: ReservationService,
    private classroomService: ClassroomService,
    private cdr: ChangeDetectorRef,
    public datePipe: DatePipe,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private pdfService: PdfService
  ) {}

  ngOnInit() {
    this.isLoadingRole = true;

    combineLatest([
      this.authService.getCurrentUserRole(),
      this.authService.getCurrentUser()
    ]).pipe(
      takeUntil(this.destroy$),
      filter(([role, user]) => role !== null && user !== null)
    ).subscribe(([role, user]) => {
      this.userRole = role;
      this.currentUser = user;
      this.isLoadingRole = false;
      this.loadDashboardDataBasedOnRole();

      // SIEMPRE CARGAR EL CALENDARIO PARA TODOS LOS ROLES
      this.loadMyUpcomingReservations();

      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter() {
    if (!this.isLoadingRole && this.userRole) {
        this.loadDashboardDataBasedOnRole();
        this.loadMyUpcomingReservations();
    }
  }

  loadDashboardDataBasedOnRole() {
    if (!this.userRole) return;
    this.isLoadingData = true;

    if (this.userRole === Rol.ADMIN) {
      this.fetchAdminDashboardData();
    } else if (this.userRole === Rol.COORDINADOR) {
      this.fetchCoordinatorDashboardData();
    } else if (this.userRole === Rol.PROFESOR || this.userRole === Rol.TUTOR) {
      this.fetchProfesorGeneralDashboardData();
    } else {
      this.isLoadingData = false;
      this.cdr.detectChanges();
    }
  }

  fetchAdminDashboardData() {
    this.isLoadingReservationsToApprove = true;
    forkJoin({
      buildings: this.buildingService.getAllBuildings().pipe(
        map(b => b.length), catchError(() => of('-'))
      ),
      availability: this.classroomService.getAvailabilitySummary().pipe(
        catchError(() => of(null))
      ),
      pending: this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE, sortField: 'startTime', sortDirection: 'desc' }).pipe(
        catchError(() => of([]))
      )
    }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
            this.isLoadingData = false;
            this.isLoadingReservationsToApprove = false;
            this.cdr.detectChanges();
        })
    ).subscribe(results => {
      this.totalBuildings = results.buildings;
      this.classroomAvailability = results.availability;
      this.reservationsToApprove = results.pending;
    });
  }

  fetchCoordinatorDashboardData() {
    this.isLoadingReservationsToApprove = true;
    this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoadingData = false;
        this.isLoadingReservationsToApprove = false;
        this.cdr.detectChanges();
      })
    ).subscribe(reservations => this.reservationsToApprove = reservations);
  }

  fetchProfesorGeneralDashboardData() {
    this.classroomService.getAvailabilitySummary().pipe(
      takeUntil(this.destroy$),
      catchError(() => of(null)),
      finalize(() => {
        this.isLoadingData = false;
        this.cdr.detectChanges();
      })
    ).subscribe(availability => this.classroomAvailability = availability);
  }

  loadMyUpcomingReservations() {
    if (!this.currentUser?.id) return;
    this.isLoadingMyReservations = true;

    this.reservationService.getMyUpcomingReservations(20).pipe(
      takeUntil(this.destroy$),
      catchError(() => of([])),
      finalize(() => {
        this.isLoadingMyReservations = false;
        this.cdr.detectChanges();
      })
    ).subscribe(reservations => {
      this.myUpcomingReservations = reservations;
    });
  }

  downloadMySchedule() {
    const confirmed = this.myUpcomingReservations.filter(r => r.status === ReservationStatus.CONFIRMADA);
    if (confirmed.length === 0) {
      this.presentToast('No tienes clases confirmadas para exportar en tu horario próximo.', 'warning');
      return;
    }
    const grouped = this.groupReservationsForPdf(confirmed);
    this.pdfService.exportProfessorSchedule(grouped, this.currentUser?.name || 'Usuario');
  }

  private groupReservationsForPdf(reservations: Reservation[]): any[] {
    const groups: { [key: string]: Reservation[] } = {};
    const viewItems: any[] = [];
    reservations.forEach(res => {
      let key = res.groupId || res.id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(res);
    });
    for (const key in groups) {
      const list = groups[key];
      list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const first = list[0];
      viewItems.push({
        rawReservation: first,
        title: first.purpose || 'Sin motivo',
        subtitle: `${first.classroom?.name} (${first.classroom?.buildingName || 'N/A'})`
      });
    }
    return viewItems;
  }

  async confirmReservationAction(reservationId: string | undefined, newStatus: ReservationStatus.CONFIRMADA | ReservationStatus.RECHAZADA) {
    if (!reservationId) return;
    const actionText = newStatus === ReservationStatus.CONFIRMADA ? 'aprobar' : 'rechazar';
    const alert = await this.alertCtrl.create({
      header: `Confirmar Acción`,
      message: `¿Estás seguro de que quieres ${actionText} esta reserva?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: actionText.charAt(0).toUpperCase() + actionText.slice(1),
          cssClass: newStatus === ReservationStatus.RECHAZADA ? 'text-kwd-red' : 'text-kwd-green',
          handler: () => this.processReservationAction(reservationId, newStatus),
        },
      ],
    });
    await alert.present();
  }

  private async processReservationAction(reservationId: string, newStatus: ReservationStatus.CONFIRMADA | ReservationStatus.RECHAZADA) {
    const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
    await loading.present();

    this.reservationService.updateReservationStatus(reservationId, newStatus)
      .pipe(
          takeUntil(this.destroy$),
          finalize(async () => await loading.dismiss())
      )
      .subscribe({
        next: async () => {
          await this.presentToast(`Reserva ${newStatus === ReservationStatus.CONFIRMADA ? 'aprobada' : 'rechazada'} exitosamente.`, 'success');
          this.loadDashboardDataBasedOnRole();
        },
        error: async (err) => await this.presentToast(err.message || 'Error al procesar.', 'danger')
      });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }
}
