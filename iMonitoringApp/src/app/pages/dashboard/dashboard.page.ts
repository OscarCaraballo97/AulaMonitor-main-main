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

// Componentes Ionic Standalone que SÍ se usan en el HTML proporcionado por el usuario
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
  IonSpinner, IonList, IonItem, IonLabel, IonBadge
  // Si usas otros como IonCard, IonRefresher, etc., añádelos aquí.
  // Basado en el HTML que proporcionaste (<ion-header class="md:hidden">...),
  // los siguientes NO parecen usarse y causaban warnings:
  // IonMenuButton, IonRefresher, IonRefresherContent, IonCard, IonCardHeader,
  // IonCardContent, IonCardTitle, IonSegment, IonSegmentButton, IonInput, IonSelect, IonSelectOption
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
    // Lista actualizada de componentes Ionic Standalone usados
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon,
    IonSpinner, IonList, IonItem, IonLabel, IonBadge
  ],
  providers: [
    DatePipe,
    PopoverController
  ]
})
export class DashboardPage implements OnInit, OnDestroy {
  // ... (El resto del código TypeScript se mantiene igual que en mi respuesta anterior,
  // ya que la lógica de carga de datos y los métodos no necesitaban cambios para esta solicitud)

  // PEGAR AQUÍ EL CUERPO DE LA CLASE DashboardPage DE LA RESPUESTA ANTERIOR
  // (Desde `private destroy$ = new Subject<void>();` hasta el final de la clase)
  // Me aseguro que el código que te doy sea completo con la lógica previa:

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
  ) {
    console.log('>>> DashboardPage: Constructor ejecutado');
  }

  ngOnInit() {
    console.log('>>> DashboardPage: ngOnInit INICIADO');
    this.isLoadingRole = true;
    this.cdr.detectChanges();

    combineLatest([
      this.authService.getCurrentUserRole(),
      this.authService.getCurrentUser()
    ]).pipe(
      takeUntil(this.destroy$),
      filter(([role, user]) => {
        console.log('>>> DashboardPage: combineLatest antes del filtro ->', { role, userId: user?.id });
        return role !== null && user !== null;
      })
    ).subscribe(([role, user]) => {
      console.log('>>> DashboardPage: Rol y Usuario recibidos (después del filtro) ->', { role: JSON.stringify(role), userId: user ? user.id : 'no user' });
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
    console.log('>>> DashboardPage: ngOnInit COMPLETADO (suscripciones configuradas)');
  }

  private hasDataLoadedOnce(): boolean {
    return (this.userRole === Rol.ADMIN && (this.reservationsToApprove.length > 0 || this.totalBuildings !== '-')) ||
           ((this.userRole === Rol.PROFESOR || this.userRole === Rol.TUTOR) && this.classroomAvailability !== null) ||
           (this.myUpcomingReservations.length > 0);
  }

  ngOnDestroy() {
    console.log('>>> DashboardPage: ngOnDestroy ejecutado');
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter() {
    console.log('>>> DashboardPage: ionViewWillEnter. Rol actual:', this.userRole, 'isLoadingRole:', this.isLoadingRole);
    if (!this.isLoadingRole && this.userRole) {
        console.log('>>> DashboardPage: ionViewWillEnter - Refrescando datos del dashboard.');
        this.loadDashboardDataBasedOnRole();
    }
  }

  loadDashboardDataBasedOnRole() {
    if (!this.userRole) {
      console.log('>>> DashboardPage: loadDashboardDataBasedOnRole() - userRole es null. No se cargan datos.');
      this.resetData();
      this.isLoadingData = false;
      this.cdr.detectChanges();
      return;
    }
    console.log('>>> DashboardPage: Cargando datos del dashboard para el rol:', this.userRole);
    this.isLoadingData = true;
    this.cdr.detectChanges();

    if (this.userRole === Rol.ADMIN) {
      this.fetchAdminDashboardData();
    } else if (this.userRole === Rol.PROFESOR) {
      this.fetchProfesorGeneralDashboardData();
    } else if (this.userRole === Rol.TUTOR) {
      this.fetchTutorGeneralDashboardData();
    } else if (this.userRole === Rol.ESTUDIANTE) {
      console.log(">>> DashboardPage: Lógica de carga para ESTUDIANTE.");
      this.fetchStudentDashboardData();
    } else {
      console.warn('>>> DashboardPage: Rol desconocido o no manejado:', this.userRole);
      this.isLoadingData = false;
      this.cdr.detectChanges();
    }
  }

  resetData() {
    console.log(">>> DashboardPage: Reseteando datos del dashboard.");
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
    console.log(">>> DashboardPage: fetchAdminDashboardData() llamado para ADMIN.");
    this.isLoadingData = true;
    this.isLoadingReservationsToApprove = true;
    this.cdr.detectChanges();

    forkJoin({
      buildings: this.buildingService.getAllBuildings().pipe(
        map(b => b.length),
        catchError(err => { console.error("Error fetching buildings:", err); this.presentToast("Error al cargar edificios.", "danger"); return of('Error'); })
      ),
      availability: this.classroomService.getAvailabilitySummary().pipe(
        catchError(err => { console.error("Error fetching availability summary:", err); this.presentToast("Error al cargar disponibilidad.", "danger"); return of(null); })
      ),
      pending: this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE, sortField: 'startTime', sortDirection: 'desc' }).pipe(
        catchError(err => { console.error("Error fetching pending reservations:", err); this.presentToast("Error al cargar pendientes.", "danger"); return of([]); })
      )
    }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
            this.isLoadingData = false;
            this.isLoadingReservationsToApprove = false;
            this.cdr.detectChanges();
            console.log(">>> DashboardPage: Datos de ADMIN procesados. Loading flags actualizados.");
        })
    ).subscribe({
        next: results => {
          this.totalBuildings = results.buildings === 'Error' ? '-' : results.buildings;
          this.classroomAvailability = results.availability;
          this.reservationsToApprove = results.pending;

          console.log(">>> DashboardPage: Datos de ADMIN cargados ->", {
              totalBuildings: this.totalBuildings,
              classroomAvailability: this.classroomAvailability,
              reservationsToApproveCount: this.reservationsToApprove.length
          });
        },
        error: (forkJoinError) => {
            console.error(">>> DashboardPage: Error en forkJoin para datos de ADMIN:", forkJoinError);
            this.presentToast("Error crítico al cargar datos del dashboard.", "danger");
            this.resetData();
        }
      });
  }

  fetchProfesorGeneralDashboardData() {
    console.log(">>> DashboardPage: fetchProfesorGeneralDashboardData() para PROFESOR/TUTOR.");
    this.isLoadingData = true;
    this.cdr.detectChanges();

    this.classroomService.getAvailabilitySummary().pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error("Error fetching availability summary for profesor/tutor:", err);
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
      console.log(">>> DashboardPage: Disponibilidad para PROFESOR/TUTOR cargada.", { availability });
    });
  }

  fetchTutorGeneralDashboardData() {
    this.fetchProfesorGeneralDashboardData();
  }

  fetchStudentDashboardData() {
    console.log(">>> DashboardPage: fetchStudentDashboardData() para ESTUDIANTE.");
    this.isLoadingData = false;
    this.cdr.detectChanges();
  }

  async toggleMyReservationsSection() {
    this.showMyReservationsSection = !this.showMyReservationsSection;
    if (this.showMyReservationsSection) { // Cargar solo si se va a mostrar
      this.loadMyUpcomingReservations();
    }
    this.cdr.detectChanges();
  }

  async loadMyUpcomingReservations() {
    if (!this.currentUser?.id) {
      console.warn(">>> DashboardPage: No se puede cargar 'Mis Reservas', ID de usuario no disponible.");
      this.isLoadingMyReservations = false;
      this.cdr.detectChanges();
      return;
    }

    console.log(">>> DashboardPage: loadMyUpcomingReservations() llamado con userId:", this.currentUser.id);
    this.isLoadingMyReservations = true;
    this.cdr.detectChanges();

    this.reservationService.getMyUpcomingReservations(3).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        console.error(">>> DashboardPage: Error cargando mis próximas reservas", err);
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
        console.log(">>> DashboardPage: 'Mis Reservas' recibidas ->", reservations);
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
          if (this.userRole === Rol.ADMIN) {
            this.fetchAdminDashboardData();
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
     console.log('Popover event (dashboard.page.ts):', ev);
     this.presentToast('Ajustes no implementados.', 'warning');
  }
}