import { Injectable } from '@angular/core';
import { DatePipe } from '@angular/common';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Injectable({
  providedIn: 'root'
})
export class PdfService {

  constructor() {}

  exportAdminLogs(logs: any[]) {
    const datePipe = new DatePipe('es-ES');
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Reporte de Uso de Aulas (Logs de Auditoría)', 14, 15);

    const body = logs.map(log => [
      log.classroomName,
      log.userName,
      log.role,
      datePipe.transform(log.startTime, 'dd/MM/yyyy HH:mm') || '',
      datePipe.transform(log.endTime, 'HH:mm') || '',
      log.purpose
    ]);

    autoTable(doc, {
      head: [['Aula', 'Usuario', 'Rol', 'Fecha/Inicio', 'Fin', 'Motivo']],
      body: body,
      startY: 20,
      styles: { fontSize: 9 }
    });

    doc.save('reporte_uso_aulas_logs.pdf');
  }

  exportProfessorSchedule(reservations: any[], userName: string) {
    const datePipe = new DatePipe('es-ES'); // Se instancia aquí adentro
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Horario de Clases - ${userName}`, 14, 15);

    const body = reservations.map(res => [
      datePipe.transform(res.rawReservation.startTime, 'EEEE') || '',
      datePipe.transform(res.rawReservation.startTime, 'dd/MM/yyyy') || '',
      (datePipe.transform(res.rawReservation.startTime, 'HH:mm') + ' - ' + datePipe.transform(res.rawReservation.endTime, 'HH:mm')),
      res.rawReservation.classroom.name,
      res.rawReservation.purpose
    ]);

    autoTable(doc, {
      head: [['Día', 'Fecha', 'Horario', 'Aula', 'Materia / Motivo']],
      body: body,
      startY: 20,
      styles: { fontSize: 10 }
    });

    doc.save(`horario_calendario.pdf`);
  }
}
