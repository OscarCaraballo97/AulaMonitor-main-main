import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Ticket } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private apiUrl = `${environment.apiUrl}/tickets`;

  constructor(private http: HttpClient) {}

  crearTicket(ticket: Ticket): Observable<Ticket> {
    return this.http.post<Ticket>(this.apiUrl, ticket).pipe(
      catchError(this.handleError)
    );
  }

  getMisTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/mis-tickets`).pipe(
      catchError(this.handleError)
    );
  }

  getAllTickets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/todos`).pipe(
      catchError(this.handleError)
    );
  }

  actualizarEstado(id: number, estado: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/estado`, { estado }).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    console.error('Error en TicketService:', error);
    return throwError(() => new Error('Error al procesar la solicitud. Por favor, inténtalo de nuevo.'));
  }
}
