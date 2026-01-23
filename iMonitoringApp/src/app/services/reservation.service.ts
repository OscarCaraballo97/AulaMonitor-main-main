import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Reservation, ReservationCreationData, ReservationStatus } from '../models/reservation.model';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface ReservationListFilters {
  status?: ReservationStatus;
  classroomId?: string;
  userId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  size?: number;
  futureOnly?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ReservationService {
  private apiUrl = `${environment.apiUrl}/reservations`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private handleError(error: HttpErrorResponse, context: string = 'Operación de reserva') {
    let userMessage = `${context}: Ocurrió un error inesperado.`;

    if (error.error instanceof ErrorEvent) {
      console.error(`[ReservationService] Error (cliente/red) en ${context}:`, error.error.message);
      userMessage = `${context}: Error de conexión o cliente.`;
    } else {
      console.error(`[ReservationService] Error (backend) en ${context}: Código ${error.status}, mensaje: ${error.error?.message || error.message}`);

      if (error.status === 400) {
        userMessage = error.error?.message || 'Datos inválidos.';
      } else if (error.status === 401) {
        userMessage = 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.';
        this.authService.logout();
      } else if (error.status === 403) {
        userMessage = 'No tienes permisos para realizar esta acción.';
      } else if (error.status === 404) {
        userMessage = 'Recurso no encontrado.';
      } else if (error.status === 500) {
        userMessage = 'Error interno del servidor.';
      } else {
        userMessage = error.error?.message || `Error ${error.status}`;
      }
    }
    return throwError(() => new Error(userMessage));
  }

  getAllReservations(filters?: ReservationListFilters): Observable<Reservation[]> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.append(key, String(value));
        }
      });
    }
    return this.http.get<Reservation[]>(`${this.apiUrl}/filter`, { params }).pipe(
      catchError(err => this.handleError(err, 'Obtener reservas'))
    );
  }

  getMyReservations(filters?: ReservationListFilters): Observable<Reservation[]> {
    let params = new HttpParams();
    if (filters) {
       Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.append(key, String(value));
        }
      });
    }
    return this.http.get<Reservation[]>(`${this.apiUrl}/my-list`, { params }).pipe(
      catchError(err => this.handleError(err, 'Obtener mis reservas'))
    );
  }

  getReservationById(id: string): Observable<Reservation> {
    return this.http.get<Reservation>(`${this.apiUrl}/${id}`).pipe(
      catchError(err => this.handleError(err, 'Obtener detalle'))
    );
  }

  createReservation(reservation: ReservationCreationData): Observable<Reservation> {
    return this.http.post<Reservation>(this.apiUrl, reservation).pipe(
      catchError(err => this.handleError(err, 'Crear reserva'))
    );
  }

  // --- MODIFICADO: Acepta editSeries y lo manda como Query Param ---
  updateReservation(id: string, reservation: Partial<ReservationCreationData>, editSeries: boolean = false): Observable<Reservation> {
    const url = `${this.apiUrl}/${id}?editSeries=${editSeries}`;
    return this.http.put<Reservation>(url, reservation).pipe(
      catchError(err => this.handleError(err, 'Actualizar reserva'))
    );
  }

  updateSemesterReservation(id: string, reservation: Partial<ReservationCreationData>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/semester/${id}`, reservation).pipe(
      catchError(err => this.handleError(err, 'Actualizar semestre'))
    );
  }

  updateReservationStatus(id: string, status: ReservationStatus): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.apiUrl}/${id}/status`, { status }).pipe(
      catchError(err => this.handleError(err, 'Actualizar estado'))
    );
  }

  deleteReservation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      catchError(err => this.handleError(err, 'Eliminar reserva'))
    );
  }

  cancelMyReservation(id: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.apiUrl}/${id}/cancel-by-user`, {}).pipe(
      catchError(err => this.handleError(err, 'Cancelar reserva'))
    );
  }

  getMyUpcomingReservations(limit: number = 5): Observable<Reservation[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<Reservation[]>(`${this.apiUrl}/my-upcoming`, { params }).pipe(
      catchError(err => this.handleError(err, 'Próximas reservas'))
    );
  }

  getReservationsByClassroomAndDateRange(classroomId: string, startDateISO: string, endDateISO: string): Observable<Reservation[]> {
    const filters: ReservationListFilters = {
      classroomId: classroomId,
      startDate: startDateISO,
      endDate: endDateISO,
      sortField: 'startTime',
      sortDirection: 'asc'
    };
    return this.getAllReservations(filters).pipe(
      catchError(err => this.handleError(err, 'Reservas por aula'))
    );
  }

  createSemesterReservation(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/semester`, data).pipe(
      catchError(err => this.handleError(err, 'Asignar semestre'))
    );
  }
}
