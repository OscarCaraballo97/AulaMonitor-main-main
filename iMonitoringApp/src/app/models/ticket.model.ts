export interface Ticket {
  id?: number;
  titulo: string;
  descripcion: string;
  estado?: string;
  fechaCreacion?: string;
  usuario?: any;
}
