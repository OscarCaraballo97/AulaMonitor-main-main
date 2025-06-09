import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { ToastController, AlertController, LoadingController, PopoverController } from '@ionic/angular/standalone';
import { CommonModule, DatePipe, formatDate, TitleCasePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Rol } from '../../models/rol.model';
import { User } from '../../models/user.model';
import { BuildingService } from '../../services/building.service';
import { ReservationService, ReservationListFilters } from '../../services/reservation.service';
import { ClassroomService, ClassroomAvailabilitySummaryDTO } from '../../services/classroom.service';
import { Reservation, ReservationStatus, ReservationClassroomDetails } from '../../models/reservation.model';
import { Subject, combineLatest, forkJoin, of, Observable } from 'rxjs';
import { takeUntil, map, catchError, filter, switchMap, finalize } from 'rxjs/operators';

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
    CommonModule,
    RouterModule,
    TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
    IonSpinner, IonList, IonItem, IonLabel, IonBadge
  ],
  providers: [
    DatePipe,
    PopoverController
  ]
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
  showMyReservationsSection = false;

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
    private popoverCtrl: PopoverController
  ) {}

  ngOnInit() {
    this.isLoadingRole = true;
    this.cdr.detectChanges();

    combineLatest([
      this.authService.getCurrentUserRole(),
      this.authService.getCurrentUser()
    ]).pipe(
      takeUntil(this.destroy$),
      filter(([role, user]) => role !== null && user !== null)
    ).subscribe(([role, user]) => {
      if (this.userRole !== role || this.currentUser?.id !== user?.id || !this.hasDataLoadedOnce()) {
          this.userRole = role;
          this.currentUser = user;
          this.isLoadingRole = false;
          this.loadDashboardDataBasedOnRole();
      } else if (this.isLoadingRole) {
          this.isLoadingRole = false;
          if (!this.isLoadingData && !this.hasDataLoadedOnce()) {
             this.loadDashboardDataBasedOnRole();
          }
      }
      this.cdr.detectChanges();
    });
  }

  private hasDataLoadedOnce(): boolean {
    return (this.userRole === Rol.ADMIN && (this.reservationsToApprove.length > 0 || this.totalBuildings !== '-')) ||
           ((this.userRole === Rol.PROFESOR || this.userRole === Rol.TUTOR) && this.classroomAvailability !== null) ||
           (this.myUpcomingReservations.length > 0);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter() {
    if (!this.isLoadingRole && this.userRole) {
        this.loadDashboardDataBasedOnRole();
    }
  }

  loadDashboardDataBasedOnRole() {
    if (!this.userRole) {
      this.resetData();
      this.isLoadingData = false;
      this.cdr.detectChanges();
      return;
    }
    this.isLoadingData = true;
    this.cdr.detectChanges();

    if (this.userRole === Rol.ADMIN) {
      this.fetchAdminDashboardData();
    } else if (this.userRole === Rol.COORDINADOR) {
      this.fetchCoordinatorDashboardData();
    } else if (this.userRole === Rol.PROFESOR) {
      this.fetchProfesorGeneralDashboardData();
    } else if (this.userRole === Rol.TUTOR) {
      this.fetchTutorGeneralDashboardData();
    } else if (this.userRole === Rol.ESTUDIANTE) {
      this.fetchStudentDashboardData();
    } else {
      this.isLoadingData = false;
      this.cdr.detectChanges();
    }
  }

  resetData() {
    this.totalBuildings = '-';
    this.classroomAvailability = null;
    this.reservationsToApprove = [];
    this.isLoadingReservationsToApprove = false;
    this.myUpcomingReservations = [];
    this.isLoadingMyReservations = false;
    this.isLoadingData = false;
    this.cdr.detectChanges();
  }

  fetchAdminDashboardData() {
    this.isLoadingData = true;
    this.isLoadingReservationsToApprove = true;
    this.cdr.detectChanges();

    forkJoin({
      buildings: this.buildingService.getAllBuildings().pipe(
        map(b => b.length),
        catchError(err => { this.presentToast("Error al cargar edificios.", "danger"); return of('Error'); })
      ),
      availability: this.classroomService.getAvailabilitySummary().pipe(
        catchError(err => { this.presentToast("Error al cargar disponibilidad.", "danger"); return of(null); })
      ),
      pending: this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE, sortField: 'startTime', sortDirection: 'desc' }).pipe(
        catchError(err => { this.presentToast("Error al cargar pendientes.", "danger"); return of([]); })
      )
    }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
            this.isLoadingData = false;
            this.isLoadingReservationsToApprove = false;
            this.cdr.detectChanges();
        })
    ).subscribe({
        next: results => {
          this.totalBuildings = results.buildings === 'Error' ? '-' : results.buildings;
          this.classroomAvailability = results.availability;
          this.reservationsToApprove = results.pending;
        },
        error: (forkJoinError) => {
            this.presentToast("Error crítico al cargar datos del dashboard.", "danger");
            this.resetData();
        }
      });
  }

  fetchCoordinatorDashboardData() {
    this.isLoadingReservationsToApprove = true;
    this.cdr.detectChanges();

    this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoadingReservationsToApprove = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: reservations => {
        this.reservationsToApprove = reservations;
      },
      error: err => {
        this.presentToast("Error al cargar las reservas pendientes.", "danger");
      }
    });
  }

  fetchProfesorGeneralDashboardData() {
    this.isLoadingData = true;
    this.cdr.detectChanges();

    this.classroomService.getAvailabilitySummary().pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        this.classroomAvailability = null;
        this.presentToast("Error al cargar disponibilidad de aulas.", "danger");
        return of(null);
      }),
      finalize(() => {
        this.isLoadingData = false;
        this.cdr.detectChanges();
      })
    ).subscribe(availability => {
      this.classroomAvailability = availability;
    });
  }

  fetchTutorGeneralDashboardData() {
    this.fetchProfesorGeneralDashboardData();
  }

  fetchStudentDashboardData() {
    this.isLoadingData = false;
    this.cdr.detectChanges();
  }

  async toggleMyReservationsSection() {
    this.showMyReservationsSection = !this.showMyReservationsSection;
    if (this.showMyReservationsSection) {
      this.loadMyUpcomingReservations();
    }
    this.cdr.detectChanges();
  }

  async loadMyUpcomingReservations() {
    if (!this.currentUser?.id) return;
    this.isLoadingMyReservations = true;
    this.cdr.detectChanges();

    this.reservationService.getMyUpcomingReservations(3).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        this.myUpcomingReservations = [];
        this.presentToast("Error al cargar tus próximas reservas.", "danger");
        return of([]);
      }),
      finalize(() => {
        this.isLoadingMyReservations = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (reservations) => {
        this.myUpcomingReservations = reservations;
      }
    });
  }

  async confirmReservationAction(reservationId: string | undefined, newStatus: ReservationStatus.CONFIRMADA | ReservationStatus.RECHAZADA) {
    if (!reservationId) {
      this.presentToast('ID de reserva inválido.', 'danger');
      return;
    }
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
          finalize(async () => {
              await loading.dismiss().catch(e => console.error("Error dismissing loading", e));
          })
      )
      .subscribe({
        next: async () => {
          await this.presentToast(`Reserva ${newStatus === ReservationStatus.CONFIRMADA ? 'aprobada' : 'rechazada'} exitosamente.`, 'success');
          if (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) {
            this.loadDashboardDataBasedOnRole();
          }
        },
        error: async (err) => {
          await this.presentToast(err.message || 'Error al procesar la reserva.', 'danger');
        }
      });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning', iconName?: string) {
    if (!message) return;
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 3000,
      color: color,
      position: 'top',
      icon: iconName
    });
    await toast.present();
  }

  async presentSettingsPopover(ev: any) {
     this.presentToast('Ajustes no implementados.', 'warning');
  }
}