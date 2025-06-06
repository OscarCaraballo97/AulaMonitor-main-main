import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidatorFn } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {AlertController, LoadingController, NavController, ToastController
} from '@ionic/angular/standalone'; 
import { AuthService } from '../../services/auth.service';
import { Rol } from '../../models/rol.model';
import { RegisterData, AuthResponse } from '../../models/auth.model'; 
import { IonicModule } from '@ionic/angular';


export function passwordMatchValidator(): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatchGlobal: true };
    }
    if (confirmPassword?.hasError('passwordMismatch') && password?.value === confirmPassword?.value) {
      const errors = confirmPassword.errors;
      if (errors) {
        delete errors['passwordMismatch'];
        if (Object.keys(errors).length === 0) confirmPassword.setErrors(null);
        else confirmPassword.setErrors(errors);
      }
    }
    return null;
  };
}

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    ReactiveFormsModule,
    RouterModule
  ]
})
export class RegisterPage implements OnInit {
  registerForm!: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;

  public rolesForSelect: { key: string, value: Rol }[] = [];
  public RolEnum = Rol; 

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router, 
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private navCtrl: NavController, 
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.rolesForSelect = Object.keys(Rol)
      .filter(key => isNaN(Number(key)) && Rol[key as keyof typeof Rol] !== Rol.ADMIN && Rol[key as keyof typeof Rol] !== Rol.COORDINADOR)
      .map(key => ({
        key: key.charAt(0).toUpperCase() + key.slice(1).toLowerCase().replace('_', ' '),
        value: Rol[key as keyof typeof Rol]
      }));

    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password_hash: ['', [Validators.required, Validators.minLength(6)]], 
      confirmPassword_hash: ['', Validators.required],
      role: [Rol.ESTUDIANTE, [Validators.required]] 
    }, { validators: passwordMatchValidator() });
  }

  get name() { return this.registerForm.get('name'); }
  get email() { return this.registerForm.get('email'); }
  get password_hash() { return this.registerForm.get('password_hash'); }
  get confirmPassword_hash() { return this.registerForm.get('confirmPassword_hash'); } 
  get role() { return this.registerForm.get('role'); }

  async onSubmit() {
    if (this.registerForm.invalid) {
      this.markFormGroupTouched(this.registerForm);
      await this.presentToast('Por favor, corrige los errores en el formulario.', 'warning', 'alert-circle-outline');
      return;
    }

    this.errorMessage = '';
    this.isLoading = true;
    const loading = await this.loadingCtrl.create({ message: 'Registrando...' });
    await loading.present();

    const formValue = this.registerForm.value;
    const finalRegistrationData: RegisterData = {
      name: formValue.name,
      email: formValue.email,
      password_hash: formValue.password_hash, 
      role: formValue.role 
    };

    console.log('Enviando datos de registro:', finalRegistrationData);

    this.authService.register(finalRegistrationData).subscribe({
      next: async (response: AuthResponse) => { 
        this.isLoading = false;
        await loading.dismiss();
        
        const successMessage = response.message || '¡Registro exitoso! Por favor, revisa tu correo electrónico para verificar tu cuenta.';
        await this.presentSuccessAlert(successMessage);
        this.navCtrl.navigateRoot('/login'); 
      },
      error: async (err: any) => {
        this.isLoading = false;
        await loading.dismiss();
        
        if (err.error && err.error.message) {
          this.errorMessage = err.error.message;
        } else if (err.message) {
          this.errorMessage = err.message;
        } else {
          this.errorMessage = 'Ocurrió un error inesperado durante el registro. Intenta de nuevo.';
        }

        if (err.status === 409) {
          this.errorMessage = this.errorMessage || 'El correo electrónico ya está registrado. Por favor, revisa tu bandeja de entrada o intenta iniciar sesión.';
        } else if (err.status === 500) {
          this.errorMessage = this.errorMessage || 'Ocurrió un error inesperado en el servidor. Por favor, intenta de nuevo más tarde.';
        }

        await this.presentToast(this.errorMessage, 'danger', 'close-circle-outline');
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'warning', iconName?: string) {
    const toast = await this.toastCtrl.create({
      message: message,
      duration: 3000,
      position: 'top',
      color: color,
      icon: iconName
    });
    toast.present();
  }

  async presentSuccessAlert(message: string) {
    const alert = await this.alertCtrl.create({
      header: 'Registro Exitoso',
      message: message,
      buttons: [{
        text: 'OK',
        role: 'cancel',
        handler: () => {
        },
      }],
    });
    await alert.present();
  }

  goToLogin() { this.navCtrl.navigateBack('/login'); }
}