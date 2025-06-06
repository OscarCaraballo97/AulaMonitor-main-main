// iMonitoringApp/src/app/pages/reservations/reservation-list/reservation-list.page.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, formatDate, TitleCasePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil, finalize, map } from 'rxjs/operators';

import { Reservation, ReservationStatus, ReservationClassroomDetails } from '../../../models/reservation.model';
import { User } from '../../../models/user.model';
import { Rol } from '../../../models/rol.model';
import { ReservationService, ReservationListFilters } from '../../../services/reservation.service';
import { AuthService } from '../../../services/auth.service';
import { ClassroomService } from '../../../services/classroom.service';
import { Classroom } from '../../../models/classroom.model';
import { ClassroomType as ReservationClassroomTypeEnum } from '../../../models/classroom-type.enum';

import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton,
  IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner, IonInput, IonSelect, IonSelectOption,
  IonRefresher, IonRefresherContent 
} from '@ionic/angular/standalone';
import { LoadingController, ToastController, AlertController, NavController } from '@ionic/angular/standalone';


@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.page.html',
  styleUrls: ['./reservation-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton,
    IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner, IonInput, IonSelect, IonSelectOption,
    IonRefresher, IonRefresherContent 
  ]
})
export class ReservationListPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  allReservations: Reservation[] = [];
  filteredAllReservations: Reservation[] = [];
  pendingReservations: Reservation[] = [];
  myReservations: Reservation[] = [];
  filteredMyReservations: Reservation[] = [];

  isLoadingPending = false;
  isLoadingMyReservations = false;
  isLoadingAllReservations = false;

  currentUser: User | null = null;
  userRole: Rol | null = null;

  selectedView: 'pending' | 'my-reservations' | 'all' = 'pending';
  searchTerm: string = '';

  public ReservationStatusEnum = ReservationStatus;
  public RolEnum = Rol;
  public ReservationClassroomTypeEnum = ReservationClassroomTypeEnum;
  errorMessage: string | null = null;

  selectedStatusFilter: ReservationStatus | 'ALL' = 'ALL';
  selectedClassroomFilter: string | 'ALL' = 'ALL';
  classrooms: Classroom[] = [];
  availableStatuses: { label: string, value: ReservationStatus | 'ALL' }[] = [
    { label: 'Todas', value: 'ALL' },
    { label: 'Pendiente', value: ReservationStatus.PENDIENTE },
    { label: 'Confirmada', value: ReservationStatus.CONFIRMADA },
    { label: 'Cancelada', value: ReservationStatus.CANCELADA },
    { label: 'Rechazada', value: ReservationStatus.RECHAZADA }
  ];

  constructor(
    private reservationService: ReservationService,
    private authService: AuthService,
    private classroomService: ClassroomService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
     this.authService.getCurrentUserRole().pipe(takeUntil(this.destroy$)).subscribe(role => {
        this.userRole = role;
     });
  }

  ionViewWillEnter() {
    this.loadDataBasedOnSegment();
  }

  loadClassroomsForFilter() {
    this.classroomService.getAllClassrooms().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.classrooms = data,
      error: (err) => console.error('Error loading classrooms for filter', err)
    });
  }

  determineInitialSegment() {
    if (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) {
      this.selectedView = 'pending';
    } else {
      this.selectedView = 'my-reservations';
    }
  }

  segmentChanged(event: any) {
    this.selectedView = event.detail.value;
    this.selectedStatusFilter = 'ALL';
    this.selectedClassroomFilter = 'ALL';
    this.searchTerm = '';
    this.applyFilters();
  }

  async loadDataBasedOnSegment(showLoading: boolean = true) {
    this.errorMessage = null;
    let loading: HTMLIonLoadingElement | undefined;
    if (showLoading) {
        loading = await this.loadingCtrl.create({ message: 'Cargando...' });
        await loading.present();
    }

    const filters: Omit<ReservationListFilters, 'searchTerm'> & { searchTerm?: string } = {
        status: this.selectedStatusFilter === 'ALL' ? undefined : this.selectedStatusFilter,
        classroomId: this.selectedClassroomFilter === 'ALL' ? undefined : this.selectedClassroomFilter,
        sortField: 'startTime',
        sortDirection: 'desc'
    };

    let dataObservable$: Observable<Reservation[]>;
    let currentLoadingFlag: 'isLoadingPending' | 'isLoadingMyReservations' | 'isLoadingAllReservations';

    if (this.selectedView === 'pending') {
        currentLoadingFlag = 'isLoadingPending';
        this[currentLoadingFlag] = true;
        filters.status = ReservationStatus.PENDIENTE;
        dataObservable$ = this.reservationService.getAllReservations(filters as ReservationListFilters).pipe(
            finalize(() => { this[currentLoadingFlag] = false; this.cdr.detectChanges(); })
        );
    } else if (this.selectedView === 'my-reservations') {
        currentLoadingFlag = 'isLoadingMyReservations';
        this[currentLoadingFlag] = true;
        dataObservable$ = this.reservationService.getMyReservations(filters as ReservationListFilters).pipe(
            finalize(() => { this[currentLoadingFlag] = false; this.cdr.detectChanges(); })
        );
    } else { // 'all'
        currentLoadingFlag = 'isLoadingAllReservations';
        this[currentLoadingFlag] = true;
        dataObservable$ = this.reservationService.getAllReservations(filters as ReservationListFilters).pipe(
            finalize(() => { this[currentLoadingFlag] = false; this.cdr.detectChanges(); })
        );
    }

    dataObservable$.pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
            let processedData = this.applyClientSideSearchFilter(data, this.searchTerm);

            if (this.selectedView === 'pending') this.pendingReservations = processedData;
            else if (this.selectedView === 'my-reservations') {
                this.myReservations = data;
                this.filteredMyReservations = processedData;
            }
            else {
                this.allReservations = data;
                this.filteredAllReservations = processedData;
            }

            if (processedData.length === 0) {
                this.errorMessage = "No se encontraron reservas con los filtros y búsqueda actuales.";
            }
            if (loading) loading.dismiss().catch(e => console.error(e));
            this.cdr.detectChanges();
        },
        error: (err) => {
            this.errorMessage = err.message || 'Error cargando reservas.';
            if (this.errorMessage) { 
                this.presentToast(this.errorMessage, 'danger');
            }
            if (loading) loading.dismiss().catch(e => console.error(e));
            this.cdr.detectChanges();
        }
    });
  }

  applyClientSideSearchFilter(reservations: Reservation[], term: string): Reservation[] {
    const searchTermLocal = term.toLowerCase().trim();
    if (!searchTermLocal) {
      return [...reservations];
    }
    return reservations.filter(res =>
      (res.purpose && res.purpose.toLowerCase().includes(searchTermLocal)) ||
      (res.classroom?.name && res.classroom.name.toLowerCase().includes(searchTermLocal)) ||
      (res.user?.name && res.user.name.toLowerCase().includes(searchTermLocal)) ||
      (res.user?.email && res.user.email.toLowerCase().includes(searchTermLocal))
    );
  }

  applyFilters() {
    this.loadDataBasedOnSegment();
  }

  canEditReservation(reservation: Reservation): boolean {
    if (!this.currentUser || !reservation.user?.id) return false;
    if (this.userRole === Rol.ADMIN) return true;
    if (this.userRole === Rol.COORDINADOR &&
        (reservation.user.id === this.currentUser.id || reservation.user?.role === Rol.ESTUDIANTE || reservation.user?.role === Rol.TUTOR || reservation.user?.role === Rol.PROFESOR) &&
        (reservation.status === ReservationStatus.PENDIENTE || reservation.status === ReservationStatus.CONFIRMADA)) {
      return true;
    }
    return reservation.user.id === this.currentUser.id && reservation.status === ReservationStatus.PENDIENTE;
  }

  canCancelReservation(reservation: Reservation): boolean {
    if (!this.currentUser || !reservation.user?.id) return false;
    if (this.userRole === Rol.ADMIN) return true;
    if (this.userRole === Rol.COORDINADOR &&
        (reservation.user?.role === Rol.ESTUDIANTE || reservation.user?.role === Rol.PROFESOR || reservation.user?.role === Rol.TUTOR || reservation.user.id === this.currentUser.id) &&
        (reservation.status === ReservationStatus.PENDIENTE || reservation.status === ReservationStatus.CONFIRMADA)) {
      return true;
    }
    return reservation.user.id === this.currentUser.id &&
           (reservation.status === ReservationStatus.PENDIENTE || reservation.status === ReservationStatus.CONFIRMADA);
  }

  canApproveOrReject(reservation: Reservation): boolean {
    if (this.userRole === Rol.ADMIN && reservation.status === ReservationStatus.PENDIENTE) return true;
    if (this.userRole === Rol.COORDINADOR &&
        (reservation.user?.role === Rol.ESTUDIANTE || reservation.user?.role === Rol.PROFESOR || reservation.user?.role === Rol.TUTOR) &&
        reservation.status === ReservationStatus.PENDIENTE) {
      return true;
    }
    return false;
  }

  async confirmAction(reservation: Reservation, action: 'confirm' | 'reject' | 'cancel') {
    if (!reservation.id) {
      this.presentToast('Error: ID de reserva no disponible.', 'danger');
      return;
    }

    let newStatus: ReservationStatus | undefined;
    let actionText: string;
    let confirmButtonText: string;
    let alertHeader: string;

    switch (action) {
      case 'confirm': newStatus = ReservationStatus.CONFIRMADA; actionText = 'confirmar'; alertHeader = 'Confirmar Reserva'; confirmButtonText = 'Sí, Confirmar'; break;
      case 'reject': newStatus = ReservationStatus.RECHAZADA; actionText = 'rechazar'; alertHeader = 'Rechazar Reserva'; confirmButtonText = 'Sí, Rechazar'; break;
      case 'cancel': actionText = 'cancelar'; alertHeader = 'Cancelar Reserva'; confirmButtonText = 'Sí, Cancelar'; break;
      default: console.error('Acción no válida para confirmAction:', action); return;
    }

    const alert = await this.alertCtrl.create({
      header: alertHeader,
      message: `¿Estás seguro de que quieres ${actionText} la reserva para "${reservation.purpose || 'el aula ' + (reservation.classroom?.name || reservation.classroom?.id)}"?`,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: confirmButtonText,
          cssClass: action === 'reject' || action === 'cancel' ? 'alert-button-danger' : '',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
            await loading.present();

            let operation$: Observable<Reservation>;

            if (action === 'cancel') {
              operation$ = this.reservationService.cancelMyReservation(reservation.id!);
            } else if (newStatus) {
              operation$ = this.reservationService.updateReservationStatus(reservation.id!, newStatus);
            } else {
              console.error("Error: newStatus no definido para la acción de estado", action);
              if(loading) { loading.dismiss().catch(e => console.error(e)); }
              this.presentToast('Acción de estado no válida.', 'danger');
              return;
            }

            operation$.pipe(
                takeUntil(this.destroy$),
                finalize(() => { if (loading) { loading.dismiss().catch(e => console.error(e)); }})
              )
              .subscribe({
                next: (updatedRes) => {
                  this.presentToast(`Reserva ${actionText}a exitosamente.`, 'success');
                  this.loadDataBasedOnSegment(false);
                  console.log(`Reserva ${actionText}a:`, updatedRes);
                },
                error: (err: Error) => {
                  console.error(`Error al ${actionText} la reserva:`, err);
                  const message = err.message || `Error desconocido al ${actionText} la reserva.`;
                  if (message) this.presentToast(message, 'danger'); 
                  this.loadDataBasedOnSegment(false);
                }
              });
          }
        },
      ],
      cssClass: 'kwd-alert',
    });
    await alert.present();
  }

  navigateToEdit(id: string | undefined) {
    if (id) {
      this.navCtrl.navigateForward(`/app/reservations/edit/${id}`);
    }
  }

  async viewReservationDetails(reservation: Reservation) {
    if (!reservation || !reservation.id) {
      this.presentToast('No se pueden mostrar los detalles: reserva no válida.', 'warning');
      return;
    }
    const classroomDetails: ReservationClassroomDetails | undefined = reservation.classroom;
    const startTime = reservation.startTime ? formatDate(new Date(reservation.startTime + 'Z'), 'dd/MM/yyyy, HH:mm', 'es-CO', 'America/Bogota') : 'N/A';
    const endTime = reservation.endTime ? formatDate(new Date(reservation.endTime + 'Z'), 'HH:mm', 'es-CO', 'America/Bogota') : 'N/A';
    const statusDisplay = reservation.status ? (reservation.status as string).charAt(0).toUpperCase() + (reservation.status as string).slice(1).toLowerCase().replace(/_/g, ' ') : 'N/A';

    const message = `Motivo: ${reservation.purpose || 'No especificado'}\n` +
                   `Aula: ${classroomDetails?.name || 'N/A'} (${classroomDetails?.buildingName || 'N/A'})\n` +
                   `Inicio: ${startTime}\n` +
                   `Fin: ${endTime}\n` +
                   `Estado: ${statusDisplay}\n` +
                   `Reservado por: ${reservation.user?.name || 'N/A'} (${reservation.user?.email || 'N/A'})\n` +
                   `ID Reserva: ${reservation.id}`;

    const alert = await this.alertCtrl.create({
      header: 'Detalles de la Reserva',
      message: message,
      buttons: ['OK'],
      mode: 'ios',
      cssClass: 'reservation-detail-alert'
    });
    await alert.present();
  }


  getEventColor(status: ReservationStatus | undefined): string {
    switch (status) {
      case ReservationStatus.CONFIRMADA: return 'var(--ion-color-success, #2dd36f)';
      case ReservationStatus.PENDIENTE: return 'var(--ion-color-warning, #ffc409)';
      case ReservationStatus.CANCELADA: return 'var(--ion-color-danger, #eb445a)';
      case ReservationStatus.RECHAZADA: return 'var(--ion-color-medium, #92949c)';
      default: return 'var(--ion-color-primary, #3880ff)';
    }
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning' | 'primary' | 'medium' | 'light', duration: number = 3000) {
    if (!message) return;
    const toast = await this.toastCtrl.create({ message, duration, color, position: 'top', buttons: [{text:'OK',role:'cancel'}] });
    await toast.present();
  }

  async handleRefresh(event?: any) {
    await this.loadDataBasedOnSegment(false);
    if (event && event.target && typeof event.target.complete === 'function') {
      event.target.complete();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}