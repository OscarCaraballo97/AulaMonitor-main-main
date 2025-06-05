import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
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
      } else if (error.status === 401 || error.status === 403) {
        userMessage = `${context}: No autorizado. Por favor, verifica tu sesión.`;
        this.authService.logout(); 
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
          if (key === 'status') { 
            params = params.append(key, String(value));
          } else {
            params = params.append(key, value as string | number | boolean);
          }
        }
      });
    }
    console.log(`[ReservationService] getAllReservations (llamando a ${this.apiUrl}/filter) con params:`, params.toString());
    return this.http.get<Reservation[]>(`${this.apiUrl}/filter`, { params }).pipe(
      catchError(err => this.handleError(err, 'obtener todas las reservas filtradas'))
    );
  }

  getMyReservations(filters?: ReservationListFilters): Observable<Reservation[]> {
    let params = new HttpParams();
    if (filters) {
       Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params = params.append(key, value as string | number | boolean);
        }
      });
    }
    console.log(`[ReservationService] getMyReservations (llamando a ${this.apiUrl}/my-list) con params:`, params.toString());
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
    console.log("[ReservationService] Creando reserva con payload:", reservation);
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

  getReservationsByClassroomAndDateRange(classroomId: string, dateOnly: string, endDateOnly?: string): Observable<Reservation[]> {
    const startDate = `${dateOnly}T00:00:00.000Z`;
    const effectiveEndDateOnly = endDateOnly || dateOnly;
    const endDate = `${effectiveEndDateOnly}T23:59:59.999Z`;

    const filters: ReservationListFilters = {
      classroomId: classroomId,
      startDate: startDate,
      endDate: endDate,
      sortField: 'startTime',
      sortDirection: 'asc'
    };
    console.log(`[ReservationService] getReservationsByClassroomAndDateRange llamando a getAllReservations (endpoint /filter) con filtros:`, filters);

    return this.getAllReservations(filters).pipe(
      tap(reservations => {
        console.log(`[ReservationService] Aula ${classroomId}: ${reservations ? reservations.length : 0} reservas recibidas del backend para el rango [${startDate}, ${endDate}].`);
      }),
      catchError(err => {
        console.error(`[ReservationService] Error en getReservationsByClassroomAndDateRange para aula ${classroomId} en rango [${startDate}, ${endDate}]:`, err);
        return throwError(() => err); 
      })
    );
  }
}