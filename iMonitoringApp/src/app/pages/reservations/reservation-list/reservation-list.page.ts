import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, Params } from '@angular/router';
import {
  IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, IonSegment, IonSegmentButton,
  IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner, IonInput, IonSelect, IonSelectOption,
  IonItemSliding, IonItemOptions, IonItemOption, IonRefresher, IonRefresherContent,
  ToastController, AlertController, NavController, LoadingController, IonMenuButton
} from '@ionic/angular/standalone';

import { ReservationService } from '../../../services/reservation.service';
import { Reservation, ReservationStatus } from '../../../models/reservation.model';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { Rol } from 'src/app/models/rol.model';
import { Subject, Observable } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';
import { ClassroomService } from 'src/app/services/classroom.service';
import { Classroom } from 'src/app/models/classroom.model';
import { ClassroomType } from 'src/app/models/classroom-type.enum';

interface StatusOption {
  value: ReservationStatus | 'ALL';
  label: string;
}

export interface ReservationViewItem {
  isGroup: boolean;
  id: string;
  rawReservation: Reservation;
  title: string;
  subtitle: string;
  userName: string;
  status: ReservationStatus;
  startTimeLabel: string;
  endTimeLabel: string;
  dateDescription: string;
  count: number;
}

@Component({
  selector: 'app-reservation-list',
  templateUrl: './reservation-list.page.html',
  styleUrls: ['./reservation-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, TitleCasePipe,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonContent,
    IonSegment, IonSegmentButton, IonList, IonCard, IonItem, IonIcon, IonLabel, IonButton, IonSpinner,
    IonInput, IonSelect, IonSelectOption, IonItemSliding, IonItemOptions, IonItemOption,
    IonRefresher, IonRefresherContent, IonMenuButton
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

  filteredAllReservations: ReservationViewItem[] = [];
  filteredMyReservations: ReservationViewItem[] = [];
  filteredPendingReservations: ReservationViewItem[] = [];

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
    private activatedRoute: ActivatedRoute,
    private datePipe: DatePipe
  ) { }

  ngOnInit() {
    this.authService.getCurrentUser().pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUser = user;
      this.authService.getCurrentUserRole().pipe(takeUntil(this.destroy$)).subscribe(role => {
        this.userRole = role;
        this.loadClassrooms();
        this.loadReservations();
      });
    });

    this.activatedRoute.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params: Params) => {
      if (params['view'] && ['my-reservations', 'pending', 'all'].includes(params['view'])) {
        this.selectedView = params['view'] as 'my-reservations' | 'pending' | 'all';
        this.cdr.detectChanges();
      }
    });
  }

  ionViewDidEnter() {
    if (this.userRole) {
      this.loadReservations();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadReservations() {
    if (!this.currentUser || !this.userRole) return;
    this.errorMessage = null;

    this.isLoadingMyReservations = true;
    this.reservationService.getMyReservations({ sortDirection: 'desc' }).pipe(
      takeUntil(this.destroy$),
      finalize(() => {
        this.isLoadingMyReservations = false;
        this.applyFilters();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (res) => { this.myReservations = res; },
      error: (err) => { this.handleLoadError(err, 'mis reservas'); }
    });

    if (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) {
      this.isLoadingPending = true;
      this.reservationService.getAllReservations({ status: ReservationStatus.PENDIENTE, sortDirection: 'desc' }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
            this.isLoadingPending = false;
            this.applyFilters();
            this.cdr.detectChanges();
        })
      ).subscribe({
        next: (res) => { this.pendingReservations = res; },
        error: (err) => { this.handleLoadError(err, 'pendientes'); }
      });

      this.isLoadingAllReservations = true;
      this.reservationService.getAllReservations({ sortDirection: 'desc' }).pipe(
        takeUntil(this.destroy$),
        finalize(() => {
            this.isLoadingAllReservations = false;
            this.applyFilters();
            this.cdr.detectChanges();
        })
      ).subscribe({
        next: (res) => { this.allReservations = res; },
        error: (err) => { this.handleLoadError(err, 'todas'); }
      });
    }
  }

  handleLoadError(err: any, context: string) {
    console.error(`Error loading ${context}:`, err);
  }

  loadClassrooms() {
    this.classroomService.getAllClassrooms().pipe(takeUntil(this.destroy$)).subscribe(c => {
      this.classrooms = c;
      this.cdr.detectChanges();
    });
  }

  // --- AGRUPACIÓN DE RESERVAS ---
  private groupReservations(reservations: Reservation[]): ReservationViewItem[] {
    const groups: { [key: string]: Reservation[] } = {};
    const viewItems: ReservationViewItem[] = [];

    // Agrupar por ID de Grupo (si existe) o por ID de reserva
    reservations.forEach(res => {
      let key = res.id;
      if (res.groupId) {
        key = res.groupId;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(res);
    });

    for (const key in groups) {
      const list = groups[key];
      // Ordenar por fecha para encontrar inicio/fin reales del grupo
      list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      const first = list[0];
      const last = list[list.length - 1];
      const isGroup = !!first.groupId;

      let dateDesc = '';

      if (isGroup) {
        if (first.recurrenceDetails) {
            // Caso ideal: el backend envía "LUNES - MIERCOLES"
            const recurrenceFormatted = this.toTitleCase(first.recurrenceDetails);
            const startStr = this.datePipe.transform(first.startTime, 'dd MMM');
            const endStr = this.datePipe.transform(last.startTime, 'dd MMM');
            dateDesc = `${recurrenceFormatted} (${startStr} - ${endStr})`;
        } else {
            // Caso fallback: Calcular días únicos y ordenarlos (Lunes antes que Martes)
            const uniqueDays = Array.from(new Set(list.map(r => new Date(r.startTime).getDay())));

            // Ordenar: Domingo(0) al final o al principio. Aquí Lunes=1..Sabado=6, Domingo=0.
            uniqueDays.sort((a, b) => {
                const isoA = a === 0 ? 7 : a;
                const isoB = b === 0 ? 7 : b;
                return isoA - isoB;
            });

            const daysStr = uniqueDays.map(d => this.getDayName(d)).join(' - ');
            dateDesc = `${daysStr} (${list.length} clases)`;
        }
      } else {
        // Reserva individual
        dateDesc = this.datePipe.transform(first.startTime, 'EEEE, d/MM/yy') || '';
      }

      viewItems.push({
        isGroup: isGroup,
        id: first.id,
        rawReservation: first,
        title: first.purpose || 'Sin motivo',
        subtitle: `${first.classroom?.name} (${first.classroom?.buildingName || 'N/A'})`,
        userName: first.user?.name || 'N/A',
        status: first.status,
        startTimeLabel: this.datePipe.transform(first.startTime, 'HH:mm') || '',
        endTimeLabel: this.datePipe.transform(first.endTime, 'HH:mm') || '',
        dateDescription: dateDesc,
        count: list.length
      });
    }

    // Ordenar la lista final por fecha de inicio más reciente
    return viewItems.sort((a, b) => {
        return new Date(b.rawReservation.startTime).getTime() - new Date(a.rawReservation.startTime).getTime();
    });
  }

  private getDayName(dayIndex: number): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayIndex];
  }

  private toTitleCase(str: string): string {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  applyFilters() {
    const groupedMy = this.groupReservations(this.myReservations);
    const groupedPending = this.groupReservations(this.pendingReservations);
    const groupedAll = this.groupReservations(this.allReservations);

    const filterFn = (item: ReservationViewItem) => {
      const res = item.rawReservation;
      const statusMatch = this.selectedStatusFilter === 'ALL' || res.status === this.selectedStatusFilter;
      const classroomMatch = this.selectedClassroomFilter === 'ALL' || res.classroom?.id === this.selectedClassroomFilter;
      const term = this.searchTerm.toLowerCase();
      const searchTermMatch = !this.searchTerm ||
        res.purpose?.toLowerCase().includes(term) ||
        res.user?.name?.toLowerCase().includes(term) ||
        res.classroom?.name?.toLowerCase().includes(term);

      return statusMatch && classroomMatch && searchTermMatch;
    };

    this.filteredMyReservations = groupedMy.filter(filterFn);
    this.filteredPendingReservations = groupedPending.filter(filterFn);
    this.filteredAllReservations = groupedAll.filter(filterFn);

    this.cdr.detectChanges();
  }

  segmentChanged(event: any) {
    this.selectedView = event.detail.value;
    this.applyFilters();
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning', duration: number = 3000) {
    const toast = await this.toastCtrl.create({ message, duration, color, position: 'top', buttons: [{ text: 'OK', role: 'cancel' }] });
    await toast.present();
  }

  async confirmAction(item: ReservationViewItem, actionType: 'confirm' | 'reject' | 'cancel') {
    const reservation = item.rawReservation;
    let header = '';
    let message = '';
    let serviceCall: Observable<Reservation>;

    const groupSuffix = item.isGroup ? ` (y las ${item.count - 1} restantes de la serie)` : '';

    if (actionType === 'confirm') {
      header = 'Confirmar Reserva';
      message = `¿Confirmar reserva de ${reservation.user?.name}?${groupSuffix}`;
      serviceCall = this.reservationService.updateReservationStatus(reservation.id, ReservationStatus.CONFIRMADA);
    } else if (actionType === 'reject') {
      header = 'Rechazar Reserva';
      message = `¿Rechazar reserva de ${reservation.user?.name}?${groupSuffix}`;
      serviceCall = this.reservationService.updateReservationStatus(reservation.id, ReservationStatus.RECHAZADA);
    } else if (actionType === 'cancel') {
      header = 'Cancelar Reserva';
      message = `¿Cancelar esta reserva?${groupSuffix}`;
      serviceCall = this.reservationService.cancelMyReservation(reservation.id);
    } else { return; }

    const alert = await this.alertCtrl.create({
      header, message,
      buttons: [
        { text: 'No', role: 'cancel' },
        {
          text: 'Sí',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Procesando...' });
            await loading.present();

            serviceCall.pipe(
              finalize(async () => await loading.dismiss()),
              takeUntil(this.destroy$)
            ).subscribe({
              next: () => {
                this.presentToast('Acción realizada con éxito.', 'success');
                this.loadReservations();
              },
              error: (err) => { this.presentToast(err.message || 'Error al procesar.', 'danger'); }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  navigateToEdit(item: ReservationViewItem) {
    this.router.navigate(['/app/reservations/edit', item.rawReservation.id]);
  }

  viewReservationDetails(item: ReservationViewItem) {
    this.navigateToEdit(item);
  }

  canApproveOrReject(item: ReservationViewItem): boolean {
    return (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR) && item.rawReservation.status === ReservationStatus.PENDIENTE;
  }

  canCancelReservation(item: ReservationViewItem): boolean {
    const res = item.rawReservation;
    return (this.userRole === Rol.ADMIN || this.userRole === Rol.COORDINADOR || (this.currentUser?.id === res.user?.id)) &&
           (res.status === ReservationStatus.PENDIENTE || res.status === ReservationStatus.CONFIRMADA);
  }

  canEditReservation(item: ReservationViewItem): boolean {
    const res = item.rawReservation;
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
