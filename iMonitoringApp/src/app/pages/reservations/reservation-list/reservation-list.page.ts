import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router'; 
import { Params } from '@angular/router';
import {
  IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonSegment, IonSegmentButton,
  IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner, IonInput, IonSelect, IonSelectOption,
  IonChip, IonItemSliding, IonItemOptions, IonItemOption, IonRefresher, IonRefresherContent,
  ToastController, AlertController, NavController, LoadingController
} from '@ionic/angular/standalone';

import { ReservationService, ReservationListFilters } from '../../../services/reservation.service';
import { Reservation, ReservationStatus, ReservationClassroomDetails } from '../../../models/reservation.model';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { Rol } from 'src/app/models/rol.model';
import { Subject, Observable, forkJoin, of, combineLatest } from 'rxjs';
import { takeUntil, catchError, finalize, tap, switchMap, map } from 'rxjs/operators';
import { ClassroomService } from 'src/app/services/classroom.service';
import { Classroom } from 'src/app/models/classroom.model';
import { ClassroomType } from 'src/app/models/classroom-type.enum';

interface StatusOption {
  value: ReservationStatus | 'ALL';
  label: string;
}

@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.page.html',
  styleUrls: ['./reservation-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent,
    IonSegment, IonSegmentButton,
    IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner,
    IonInput, IonSelect, IonSelectOption,
    IonItemSliding, IonItemOptions, IonItemOption,
    IonRefresher, IonRefresherContent
  ],
  providers: [DatePipe]
})
export class ReservationListPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUser: User | null = null;
  userRole: Rol | null = null;
  public RolEnum = Rol;
  public ClassroomType = ClassroomType;

  allReservations: Reservation[] = [];
  myReservations: Reservation[] = [];
  pendingReservations: Reservation[] = [];

  filteredAllReservations: Reservation[] = [];
  filteredMyReservations: Reservation[] = [];
  filteredPendingReservations: Reservation[] = [];


  isLoadingAllReservations = true;
  isLoadingMyReservations = true;
  isLoadingPending = true;

  errorMessage: string | null = null;

  selectedView: 'my-reservations' | 'pending' | 'all' = 'my-reservations';

  classrooms: Classroom[] = [];
  selectedStatusFilter: StatusOption['value'] = 'ALL';
  selectedClassroomFilter: string = 'ALL';
  searchTerm: string = '';

  availableStatuses: StatusOption[] = [
    { value: 'ALL', label: 'Todos' },
    { value: ReservationStatus.PENDIENTE, label: 'Pendiente' },
    { value: ReservationStatus.CONFIRMADA, label: 'Confirmada' },
    { value: ReservationStatus.RECHAZADA, label: 'Rechazada' },
    { value: ReservationStatus.CANCELADA, label: 'Cancelada' }
  ];

  constructor(
    private reservationService: ReservationService,
    private authService: AuthService,
    private classroomService: ClassroomService,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private loadingCtrl: LoadingController,
    private activatedRoute: ActivatedRoute 
  ) { }

  ngOnInit() {
    this.authService.getCurrentUser().pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => {
      this.currentUser = user;
      this.authService.getCurrentUserRole().pipe(
        takeUntil(this.destroy$)
      ).subscribe(role => {
        this.userRole = role;
        this.loadReservations();
        this.loadClassrooms();
      });
    });

    this.activatedRoute.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params: Params) => {
      if (params['view'] && ['my-reservations', 'pending', 'all'].includes(params['view'])) {
        this.selectedView = params['view'] as 'my-reservations' | 'pending' | 'all';
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadReservations() {
    if (!this.currentUser || !this.userRole) return;

    this.errorMessage = null;

    this.isLoadingMyReservations = true;
    this.reservationService.getMyReservations().pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoadingMyReservations = false;
        this.applyFilters();
      }),
      catchError(err => {
        this.errorMessage = err.message || 'Error al cargar tus reservas.';
        this.presentToast(this.errorMessage || 'Error desconocido', 'danger');
        return of([]);
      })
    ).subscribe(reservations => {
      this.myReservations = reservations;
      this.cdr.detectChanges();
    });

    if (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) {
      this.isLoadingPending = true;
      this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoadingPending = false;
          this.applyFilters();
        }),
        catchError(err => {
          this.errorMessage = err.message || 'Error al cargar reservas pendientes.';
          this.presentToast(this.errorMessage || 'Error desconocido', 'danger');
          return of([]);
        })
      ).subscribe(reservations => {
        this.pendingReservations = reservations;
        this.cdr.detectChanges();
      });

      this.isLoadingAllReservations = true;
      this.reservationService.getAllReservations().pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoadingAllReservations = false;
          this.applyFilters();
        }),
        catchError(err => {
          this.errorMessage = err.message || 'Error al cargar todas las reservas.';
          this.presentToast(this.errorMessage || 'Error desconocido', 'danger');
          return of([]);
        })
      ).subscribe(reservations => {
        this.allReservations = reservations;
        this.cdr.detectChanges();
      });
    }
  }

  loadClassrooms() {
    this.classroomService.getAllClassrooms().pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        this.presentToast('Error al cargar la lista de aulas para filtros.', 'danger');
        return of([] as Classroom[]);
      })
    ).subscribe(classrooms => {
      this.classrooms = classrooms;
      this.cdr.detectChanges();
    });
  }

  applyFilters() {
    const filterFn = (res: Reservation) => {
      const statusMatch = this.selectedStatusFilter === 'ALL' || res.status === this.selectedStatusFilter;
      const classroomMatch = this.selectedClassroomFilter === 'ALL' || res.classroom?.id === this.selectedClassroomFilter;
      const searchTermMatch = !this.searchTerm ||
        res.purpose?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        res.user?.name?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        res.classroom?.name?.toLowerCase().includes(this.searchTerm.toLowerCase());
      return statusMatch && classroomMatch && searchTermMatch;
    };

    this.filteredMyReservations = this.myReservations.filter(filterFn);
    this.filteredPendingReservations = this.pendingReservations.filter(filterFn);
    this.filteredAllReservations = this.allReservations.filter(filterFn);

    this.cdr.detectChanges();
  }

  segmentChanged(event: any) {
    this.selectedView = event.detail.value;
    this.applyFilters();
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning', duration: number = 3000) {
    if (!message) return;
    const toast = await this.toastCtrl.create({
      message,
      duration,
      color,
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }]
    });
    await toast.present();
  }

  async confirmAction(reservation: Reservation, actionType: 'confirm' | 'reject' | 'cancel') {
    let header = '';
    let message = '';
    let statusToUpdate: ReservationStatus | null = null;
    let serviceCall: Observable<Reservation>;

    if (actionType === 'confirm') {
      header = 'Confirmar Reserva';
      message = `¿Estás seguro de que quieres confirmar la reserva de ${reservation.user?.name || 'N/A'} para el aula ${reservation.classroom?.name || 'N/A'}?`;
      statusToUpdate = ReservationStatus.CONFIRMADA;
      serviceCall = this.reservationService.updateReservationStatus(reservation.id, statusToUpdate);
    } else if (actionType === 'reject') {
      header = 'Rechazar Reserva';
      message = `¿Estás seguro de que quieres rechazar la reserva de ${reservation.user?.name || 'N/A'} para el aula ${reservation.classroom?.name || 'N/A'}?`;
      statusToUpdate = ReservationStatus.RECHAZADA;
      serviceCall = this.reservationService.updateReservationStatus(reservation.id, statusToUpdate);
    } else if (actionType === 'cancel') {
      header = 'Cancelar Reserva';
      message = `¿Estás seguro de que quieres cancelar la reserva para el aula ${reservation.classroom?.name || 'N/A'}?`;
      statusToUpdate = ReservationStatus.CANCELADA;
      serviceCall = this.reservationService.cancelMyReservation(reservation.id); 
    } else {
      return; 
    }

    const alert = await this.alertCtrl.create({
      header: header,
      message: message,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Sí',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Actualizando reserva...' });
            await loading.present();
            serviceCall.pipe(
              finalize(async () => await loading.dismiss()),
              takeUntil(this.destroy$)
            ).subscribe({
              next: async () => {
                await this.presentToast('Reserva actualizada exitosamente.', 'success');
                this.loadReservations();
              },
              error: async (err) => {
                await this.presentToast(err.message || 'Error al actualizar la reserva.', 'danger');
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  viewReservationDetails(reservation: Reservation) {
    this.router.navigate(['/app/reservations/edit', reservation.id]);
  }

  navigateToEdit(reservationId: string) {
    this.router.navigate(['/app/reservations/edit', reservationId]);
  }

  canApproveOrReject(res: Reservation): boolean {
    return (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) && res.status === ReservationStatus.PENDIENTE;
  }

  canCancelReservation(res: Reservation): boolean {
    return (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR || (this.currentUser?.id === res.user?.id)) &&
           (res.status === ReservationStatus.PENDIENTE || res.status === ReservationStatus.CONFIRMADA);
  }

  canEditReservation(res: Reservation): boolean {
    if (this.userRole === Rol.ADMIN) return true;
    if (this.userRole === Rol.COORDINADOR) {
      const isStudentRes = res.user?.role === Rol.ESTUDIANTE;
      const isOwner = this.currentUser?.id === res.user?.id;
      return (isStudentRes && (res.status === ReservationStatus.PENDIENTE || res.status === ReservationStatus.CONFIRMADA)) ||
             (isOwner && res.status === ReservationStatus.PENDIENTE);
    }

    return this.currentUser?.id === res.user?.id && res.status === ReservationStatus.PENDIENTE;
  }


  getStatusColor(status: ReservationStatus): string {
    switch (status) {
      case ReservationStatus.PENDIENTE: return '#FFC107'; 
      case ReservationStatus.CONFIRMADA: return '#28A745';
      case ReservationStatus.RECHAZADA: return '#DC3545'; 
      case ReservationStatus.CANCELADA: return '#6C757D'; 
      default: return '#007BFF'; 
    }
  }
  
  async handleRefresh(event: any) {
    await this.loadReservations();
    event.target.complete();
  }
}