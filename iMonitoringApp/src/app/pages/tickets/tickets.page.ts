import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ToastController } from '@ionic/angular';
import { TicketService } from 'src/app/services/ticket.service';
import { AuthService } from 'src/app/services/auth.service';
import { Rol } from 'src/app/models/rol.model';

@Component({
  selector: 'app-tickets',
  templateUrl: './tickets.page.html',
  styleUrls: ['./tickets.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class TicketsPage implements OnInit {
  tickets: any[] = [];
  isAdmin = false;
  isLoading = true;

  constructor(
    private ticketService: TicketService,
    private authService: AuthService,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.authService.getCurrentUserRole().subscribe(role => {
      this.isAdmin = (role === Rol.ADMIN || role === Rol.COORDINADOR);
      this.cargarTickets();
    });
  }

  ionViewWillEnter() {
    this.cargarTickets();
  }

  cargarTickets() {
    this.isLoading = true;

    const peticion = this.isAdmin ? this.ticketService.getAllTickets() : this.ticketService.getMisTickets();

    peticion.subscribe({
      next: (data) => {
        this.tickets = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error("Error cargando tickets", err);
        this.isLoading = false;
      }
    });
  }

  cambiarEstado(ticketId: number, event: any) {
    const nuevoEstado = event.detail.value;

    this.ticketService.actualizarEstado(ticketId, nuevoEstado).subscribe({
      next: () => {
        this.toastCtrl.create({ message: 'Estado actualizado correctamente', duration: 2000, color: 'success' }).then(t => t.present());
      },
      error: () => {
        this.toastCtrl.create({ message: 'Error al actualizar', duration: 2000, color: 'danger' }).then(t => t.present());
        this.cargarTickets();
      }
    });
  }

  getColorEstado(estado: string): string {
    if (!estado) return 'medium';
    switch (estado.toUpperCase()) {
      case 'PENDIENTE': return 'warning';
      case 'EN PROGRESO': return 'primary';
      case 'RESUELTO': return 'success';
      case 'RECHAZADO': return 'danger';
      default: return 'medium';
    }
  }
}
