import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController, NavController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';
import { Rol } from '../../../models/rol.model';
import { Subject, Observable } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.page.html',
  styleUrls: ['./user-form.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule, RouterModule]
})
export class UserFormPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  userForm!: FormGroup;
  isEditMode = false;
  userId: string | null = null;
  isLoading = false;
  errorMessage: string = '';
  pageTitle = 'Nuevo Usuario';
  currentUser: User | null = null;
  loggedInUserRole: Rol | null = null;
  public rolesForSelect: { key: string, value: Rol }[] = [];
  public RolEnum = Rol;

  private careerGroups: { [key: string]: string[] } = {
    'SISTEMAS': ['Ingeniería de Sistemas', 'Tecnología en Desarrollo de Sistemas de Información y de Software'],
    'INDUSTRIAL': ['Ingeniería Industrial', 'Tecnología en Sistemas de Gestión de Calidad'],
    'TURISMO': ['Administración de Empresas Turísticas y Hoteleras', 'Tecnología en Gestión de Servicios Turísticos y Hoteleros'],
    'ADMINISTRACION': ['Administración de Empresas'],
    'CONTADURIA': ['Contaduría Pública'],
    'DERECHO': ['Derecho'],
    'BILINGUISMO': ['Licenciatura en Bilingüismo con énfasis en Inglés']
  };

  private allCareers: string[] = [
    'Administración de Empresas', 'Contaduría Pública', 'Derecho',
    'Licenciatura en Bilingüismo con énfasis en Inglés', 'Ingeniería Industrial',
    'Ingeniería de Sistemas', 'Administración de Empresas Turísticas y Hoteleras',
    'Tecnología en Sistemas de Gestión de Calidad',
    'Tecnología en Desarrollo de Sistemas de Información y de Software',
    'Tecnología en Gestión de Servicios Turísticos y Hoteleros'
  ];

  public availableCareers: string[] = [];

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: [''],
      role: [Rol.ESTUDIANTE, Validators.required],
      career: ['', Validators.required],
      avatarUrl: ['']
    });

    this.authService.getCurrentUser().pipe(takeUntil(this.destroy$)).subscribe(user => {
        this.currentUser = user;
        this.loggedInUserRole = user?.role || null;
        this.setupRolesForSelect();
        this.setupCareersForSelect();
        this.cdr.detectChanges();
    });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.userId = params.get('id');
      if (this.userId) {
        this.isEditMode = true;
        this.pageTitle = 'Editar Usuario';
        this.userForm.get('password')?.clearValidators();
        this.loadUserData(this.userId);
      } else {
        this.isEditMode = false;
        this.pageTitle = 'Nuevo Usuario';
        this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
      }
      this.userForm.get('password')?.updateValueAndValidity();
      this.cdr.detectChanges();
    });
  }

  // MÉTODO CORREGIDO: Permite al Coordinador elegir TUTOR
  setupRolesForSelect() {
    if (this.loggedInUserRole === Rol.ADMIN) {
      this.rolesForSelect = Object.keys(Rol)
        .filter(key => isNaN(Number(key)))
        .map(key => ({ key: key.replace('_', ' '), value: Rol[key as keyof typeof Rol] }));
    } else if (this.loggedInUserRole === Rol.COORDINADOR) {
      this.rolesForSelect = Object.keys(Rol)
        .filter(key => isNaN(Number(key)) &&
          (Rol[key as keyof typeof Rol] === Rol.ESTUDIANTE ||
           Rol[key as keyof typeof Rol] === Rol.PROFESOR ||
           Rol[key as keyof typeof Rol] === Rol.TUTOR)) // Agregado Tutor
        .map(key => ({ key: key.replace('_', ' '), value: Rol[key as keyof typeof Rol] }));
    }
  }

  setupCareersForSelect() {
    if (this.loggedInUserRole === Rol.ADMIN) {
      this.availableCareers = [...this.allCareers];
    } else if (this.loggedInUserRole === Rol.COORDINADOR && this.currentUser?.career) {
      const coordinatorCareer = this.currentUser.career;
      let foundGroup: string[] | null = null;
      for (const groupKey in this.careerGroups) {
        if (this.careerGroups[groupKey].includes(coordinatorCareer)) {
          foundGroup = this.careerGroups[groupKey];
          break;
        }
      }
      this.availableCareers = foundGroup ? foundGroup : [coordinatorCareer];
      if (this.availableCareers.length === 1) {
          this.userForm.patchValue({ career: this.availableCareers[0] });
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadUserData(id: string) {
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: 'Cargando...' });
    await loading.present();
    this.userService.getUserById(id).pipe(takeUntil(this.destroy$), finalize(async () => {
        this.isLoading = false;
        await loading.dismiss();
    })).subscribe({
      next: (user) => {
        this.userForm.patchValue({
          name: user.name,
          email: user.email,
          role: user.role,
          career: user.career,
          avatarUrl: user.avatarUrl
        });
        this.cdr.detectChanges();
      },
      error: async (err) => {
        this.errorMessage = err.message || 'Error al cargar usuario.';
        await this.presentToast(this.errorMessage, 'danger');
        this.navCtrl.navigateBack('/app/users');
      }
    });
  }

  async onSubmit() {
    if (this.userForm.invalid) {
      await this.presentToast('Por favor, corrige los errores.', 'warning');
      return;
    }
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: this.isEditMode ? 'Guardando...' : 'Creando...' });
    await loading.present();
    const userData = this.userForm.getRawValue();
    if (this.isEditMode && !userData.password) delete userData.password;

    let operation: Observable<User> = this.isEditMode && this.userId
      ? this.userService.updateUser(this.userId, userData)
      : this.userService.createUser(userData as User);

    operation.pipe(takeUntil(this.destroy$), finalize(async () => {
        this.isLoading = false;
        await loading.dismiss();
    })).subscribe({
      next: async () => {
        await this.presentToast('Operación exitosa.', 'success');
        this.navCtrl.navigateBack('/app/users');
      },
      error: async (err) => {
        let msg = err.error?.message || err.message || 'Error en la operación.';
        await this.presentToast(msg, 'danger');
      }
    });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'top' });
    await toast.present();
  }

  cancel() {
    this.navCtrl.navigateBack('/app/users');
  }
}
