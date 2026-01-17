import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
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
    let userMessage = `${context}: Ocurrió un error inesperado. Por favor, inténtalo de nuevo más tarde.`;

    if (error.error instanceof ErrorEvent) {
      console.error(`[ReservationService] Error (cliente/red) en ${context}:`, error.error.message);
      userMessage = `${context}: Error de red o del cliente: ${error.error.message}`;
    } else {
      console.error(`[ReservationService] Error (backend) en ${context}: Código ${error.status}, mensaje: ${error.error?.message || error.message}`, error);

      if (error.status === 400) {
        userMessage = `${context}: ${error.error?.message || 'Datos inválidos.'}`;
      } else if (error.status === 401) {
        // CORRECCIÓN: SOLO el 401 cierra la sesión (token inválido/vencido)
        userMessage = `${context}: Sesión caducada. Por favor, inicia sesión nuevamente.`;
        this.authService.logout();
      } else if (error.status === 403) {
        // CORRECCIÓN: El 403 NO cierra sesión, solo avisa que no tiene permisos
        userMessage = `${context}: No tienes permisos suficientes para realizar esta acción.`;
      } else if (error.status === 404) {
        userMessage = `${context}: Recurso no encontrado.`;
      } else if (error.status === 500) {
        userMessage = `${context}: Ocurrió un error inesperado en el servidor.`;
      } else {
         userMessage = `${context}: Código ${error.status}, mensaje: ${error.error?.message || error.message}`;
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
    console.log(`[ReservationService] getAllReservations llamando a ${this.apiUrl}/filter`, params.toString());
    return this.http.get<Reservation[]>(`${this.apiUrl}/filter`, { params }).pipe(
      catchError(err => this.handleError(err, 'obtener todas las reservas filtradas'))
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
    console.log(`[ReservationService] getMyReservations llamando a ${this.apiUrl}/my-list`, params.toString());
    return this.http.get<Reservation[]>(`${this.apiUrl}/my-list`, { params }).pipe(
      catchError(err => this.handleError(err, 'obtener mis reservas'))
    );
  }

  getReservationById(id: string): Observable<Reservation> {
    return this.http.get<Reservation>(`${this.apiUrl}/${id}`).pipe(
      catchError(err => this.handleError(err, `obtener reserva ID ${id}`))
    );
  }

  createReservation(reservation: ReservationCreationData): Observable<Reservation> {
    console.log("[ReservationService] Creando reserva:", reservation);
    return this.http.post<Reservation>(this.apiUrl, reservation).pipe(
      catchError(err => this.handleError(err, 'crear reserva'))
    );
  }

  updateReservation(id: string, reservation: Partial<ReservationCreationData>): Observable<Reservation> {
    return this.http.put<Reservation>(`${this.apiUrl}/${id}`, reservation).pipe(
      catchError(err => this.handleError(err, `actualizar reserva ID ${id}`))
    );
  }

  updateReservationStatus(id: string, status: ReservationStatus): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.apiUrl}/${id}/status`, { status }).pipe(
      catchError(err => this.handleError(err, `actualizar estado de reserva ID ${id}`))
    );
  }

  deleteReservation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      catchError(err => this.handleError(err, `eliminar reserva ID ${id}`))
    );
  }

  cancelMyReservation(id: string): Observable<Reservation> {
    return this.http.patch<Reservation>(`${this.apiUrl}/${id}/cancel-by-user`, {}).pipe(
      catchError(err => this.handleError(err, `cancelar mi reserva ID ${id}`))
    );
  }

  getMyUpcomingReservations(limit: number = 5): Observable<Reservation[]> {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<Reservation[]>(`${this.apiUrl}/my-upcoming`, { params }).pipe(
      catchError(err => this.handleError(err, 'obtener mis próximas reservas'))
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
      tap(reservations => {
        console.log(`[ReservationService] Reservas recuperadas: ${reservations ? reservations.length : 0}`);
      }),
      catchError(err => {
        console.error(`[ReservationService] Error obteniendo reservas por rango:`, err);
        return throwError(() => this.handleError(err, 'obtener reservas por aula y rango de fecha'));
      })
    );
  }

  createSemesterReservation(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/semester`, data).pipe(
      catchError(err => this.handleError(err, 'crear reserva de semestre'))
    );
  }
}
