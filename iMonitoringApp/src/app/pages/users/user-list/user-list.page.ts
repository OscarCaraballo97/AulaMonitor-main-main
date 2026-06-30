import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule, AlertController, LoadingController, ToastController, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { UserService } from '../../../services/user.service';
import { User } from '../../../models/user.model';
import { Rol } from '../../../models/rol.model';
import { Subject, Observable, forkJoin, of } from 'rxjs';
import { takeUntil, map, catchError, finalize } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.page.html',
  styleUrls: ['./user-list.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule],
})
export class UserListPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  users: User[] = [];
  allUsers: User[] = [];
  isLoading = false;
  errorMessage: string = '';
  public RolEnum = Rol;
  currentUserRole: Rol | null = null;

  isModalOpen = false;
  selectedUser: User | null = null;
  selectedUserReservations: any[] = [];
  isLoadingReservations = false;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {}

  ngOnInit() {
     this.authService.getCurrentUserRole().pipe(takeUntil(this.destroy$)).subscribe(role => {
        this.currentUserRole = role;
     });
  }

  ionViewWillEnter() {
    this.loadUsers();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  searchUsers(event: any) {
    const searchTerm = event.detail.value?.toLowerCase() || '';
    if (!searchTerm) {
      this.users = [...this.allUsers];
      return;
    }
    this.users = this.allUsers.filter(user => {
      const name = user.name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';
      const doc = user.documentNumber?.toLowerCase() || '';
      const inst = user.institution?.toLowerCase() || '';
      const code = user.studentCode?.toLowerCase() || '';

      return name.includes(searchTerm) ||
             email.includes(searchTerm) ||
             doc.includes(searchTerm) ||
             inst.includes(searchTerm) ||
             code.includes(searchTerm);
    });
  }

  async loadUsers(event?: CustomEvent) {
    this.isLoading = true;
    this.errorMessage = '';
    let loadingOverlay: HTMLIonLoadingElement | undefined;

    if (!event) {
      loadingOverlay = await this.loadingCtrl.create({ message: 'Cargando usuarios...' });
      await loadingOverlay.present();
    }

    let usersObservable: Observable<User[]>;

    if (this.currentUserRole === Rol.ADMIN) {
      usersObservable = this.userService.getAllUsers();
    } else if (this.currentUserRole === Rol.COORDINADOR) {
      usersObservable = forkJoin([
        this.userService.getUsersByRole(Rol.ESTUDIANTE).pipe(catchError(() => of([] as User[]))),
        this.userService.getUsersByRole(Rol.TUTOR).pipe(catchError(() => of([] as User[]))),
        this.userService.getUsersByRole(Rol.PROFESOR).pipe(catchError(() => of([] as User[])))
      ]).pipe(
        map(([students, tutors, professors]) => [...students, ...tutors, ...professors])
      );
    } else {
      this.users = [];
      this.isLoading = false;
      if (loadingOverlay) await loadingOverlay.dismiss();
      if (event && event.target) (event.target as any).complete();
      return;
    }

    usersObservable.pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: User[]) => {
        this.allUsers = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.users = [...this.allUsers];
        this.isLoading = false;
      },
      error: async (err: Error) => {
        this.errorMessage = err.message || 'Error al cargar usuarios.';
        this.isLoading = false;
        await this.presentToast(this.errorMessage, 'danger');
      },
      complete: async () => {
        if (loadingOverlay) await loadingOverlay.dismiss();
        if (event && event.target) (event.target as any).complete();
        this.cdr.detectChanges();
      }
    });
  }

  openUserDetails(user: User) {
    this.selectedUser = user;
    this.isModalOpen = true;
    this.selectedUserReservations = [];
    this.isLoadingReservations = true;

    this.http.get<any[]>(`${environment.apiUrl}/reservations?userId=${user.id}`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isLoadingReservations = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (res) => {
          this.selectedUserReservations = Array.isArray(res) ? res : [];
        },
        error: (err) => {
          console.error('Error cargando reservas de usuario', err);
        }
      });
  }

  canEditUser(userToList: User): boolean {
    if (this.currentUserRole === Rol.ADMIN) return true;
    return this.currentUserRole === Rol.COORDINADOR &&
           (userToList.role === Rol.ESTUDIANTE || userToList.role === Rol.TUTOR || userToList.role === Rol.PROFESOR);
  }

  canDeleteUser(userToList: User): boolean {
    return this.currentUserRole === Rol.ADMIN && userToList.role !== Rol.ADMIN;
  }

  navigateToAddUser() {
    if (this.currentUserRole === Rol.ADMIN || this.currentUserRole === Rol.COORDINADOR) {
        this.navCtrl.navigateForward('/app/users/new');
    } else {
        this.presentToast('No tienes permisos para crear usuarios.', 'warning');
    }
  }

  navigateToEditUser(userId?: string) {
    if (!userId) return;
    const userToEdit = this.users.find(u => u.id === userId);
    if (userToEdit && this.canEditUser(userToEdit)) {
        this.navCtrl.navigateForward(`/app/users/edit/${userId}`);
    } else {
        this.presentToast('No tienes permisos para editar este usuario.', 'warning');
    }
  }

  async onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const loading = await this.loadingCtrl.create({ message: 'Procesando Excel de Usuarios...' });
      await loading.present();

      this.userService.uploadUsersExcel(file)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (res) => {
            await loading.dismiss();
            await this.presentToast(res.message || 'Carga masiva exitosa', 'success');
            this.loadUsers();
          },
          error: async (err) => {
            await loading.dismiss();
            await this.presentToast(err.error?.error || 'Error al subir el archivo Excel', 'danger');
          }
        });

      event.target.value = null;
    }
  }

  async confirmDelete(user: User) {
    if (!user.id || !this.canDeleteUser(user)) {
        await this.presentToast('No tienes permisos para eliminar este usuario.', 'warning');
        return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Confirmar Eliminación',
      message: `¿Estás seguro de eliminar al usuario "${user.name || user.email}"?`,
      cssClass: 'alerta-cancelar',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', cssClass: 'text-danger', handler: () => this.deleteUser(user.id!) }
      ],
    });
    await alert.present();
  }

  private async deleteUser(id: string) {
    const loading = await this.loadingCtrl.create({ message: 'Eliminando usuario...' });
    await loading.present();
    this.userService.deleteUser(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: async () => {
        await this.presentToast('Usuario eliminado exitosamente.', 'success');
        this.loadUsers();
      },
      error: async (err: Error) => {
        await this.presentToast(err.message || 'Error al eliminar el usuario.', 'danger');
      },
      complete: async () => {
        await loading.dismiss();
      }
    });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }

  handleRefresh(event: CustomEvent) {
    this.loadUsers(event);
  }
}
