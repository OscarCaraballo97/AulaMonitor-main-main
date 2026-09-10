import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonicModule, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { TicketService } from 'src/app/services/ticket.service';
import { ClassroomService } from 'src/app/services/classroom.service';

@Component({
  selector: 'app-ticket-modal',
  templateUrl: './ticket-modal.component.html',
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule]
})
export class TicketModalComponent implements OnInit {
  ticketForm: FormGroup;
  classrooms: any[] = [];

  constructor(
    private fb: FormBuilder,
    private ticketService: TicketService,
    private classroomService: ClassroomService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController
  ) {
    this.ticketForm = this.fb.group({
      titulo: ['', Validators.required],
      lugar: ['', Validators.required],
      descripcion: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.classroomService.getAllClassrooms().subscribe(data => this.classrooms = data);
  }

  cerrar() {
    this.modalCtrl.dismiss();
  }

  async enviarTicket() {
    if (this.ticketForm.invalid) {
      this.ticketForm.markAllAsTouched();
      return;
    }
    const loading = await this.loadingCtrl.create({ message: 'Enviando...' });
    await loading.present();

    this.ticketService.crearTicket(this.ticketForm.value).subscribe({
      next: async () => {
        await loading.dismiss();
        this.mostrarToast('Ticket enviado. Lo revisaremos pronto.', 'success');
        this.modalCtrl.dismiss({ success: true });
      },
      error: async (err) => {
        await loading.dismiss();
        if(err.status === 200) {
           this.mostrarToast('Ticket enviado exitosamente.', 'success');
           this.modalCtrl.dismiss({ success: true });
        } else {
           this.mostrarToast('Error al enviar el ticket.', 'danger');
        }
      }
    });
  }

  async mostrarToast(msg: string, color: string) {
    const toast = await this.toastCtrl.create({ message: msg, duration: 3000, color: color });
    toast.present();
  }
}
