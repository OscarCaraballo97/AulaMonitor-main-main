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

  exportProfessorSchedule(reservations: any[], scopeName: string) {
    const datePipe = new DatePipe('es-ES');
    const doc = new jsPDF();
    doc.setFontSize(16);

    doc.text(`Horario Mensual - ${scopeName}`, 14, 15);

    const groupedByMonth: { [key: string]: any[] } = {};

    reservations.forEach(item => {
      const raw = item.rawReservation ? item.rawReservation : item;
      const date = new Date(raw.startTime);
      const monthYear = datePipe.transform(date, 'MMMM yyyy') || 'Mes Desconocido';
      const capitalizedMonth = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);

      if (!groupedByMonth[capitalizedMonth]) {
        groupedByMonth[capitalizedMonth] = [];
      }
      groupedByMonth[capitalizedMonth].push(item);
    });

    let currentY = 25;

    for (const [month, itemList] of Object.entries(groupedByMonth)) {

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.setFont("helvetica", "bold");
      doc.text(month, 14, currentY);
      currentY += 5;

      const body = itemList.map(item => {
        const raw = item.rawReservation ? item.rawReservation : item;
        const quantityStr = item.isGroup ? `${item.count} Clases` : '1 Clase';

        return [
          item.dateDescription || (datePipe.transform(raw.startTime, 'EEEE, dd/MM') || 'N/A'),
          (item.startTimeLabel || datePipe.transform(raw.startTime, 'HH:mm')) + ' - ' + (item.endTimeLabel || datePipe.transform(raw.endTime, 'HH:mm')),
          raw.classroom ? raw.classroom.name : 'N/A',
          raw.purpose || 'Sin propósito',
          quantityStr
        ];
      });

      autoTable(doc, {
        head: [['Días / Fechas', 'Horario', 'Aula', 'Materia / Motivo', 'Cantidad']],
        body: body,
        startY: currentY,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [86, 136, 206], textColor: [255, 255, 255] },
        margin: { bottom: 15 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    doc.save(`Horario_Mensual_${scopeName.replace(/\s+/g, '_')}.pdf`);
  }

  exportGeneralSchedule(reservations: any[], scopeName: string) {
    const datePipe = new DatePipe('es-ES');
    const doc = new jsPDF();
    doc.setFontSize(16);

    const title = `Horario de Reservas (Lista) - ${scopeName}`;
    doc.text(title, 14, 15);

    const sorted = [...reservations].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const body = sorted.map(r => {
      return [
        datePipe.transform(r.startTime, 'dd/MM/yyyy') || '',
        (datePipe.transform(r.startTime, 'HH:mm') || '') + ' - ' + (datePipe.transform(r.endTime, 'HH:mm') || ''),
        r.classroom && r.classroom.name ? r.classroom.name : 'N/A',
        r.user && r.user.name ? r.user.name : 'N/A',
        r.purpose || 'Sin propósito'
      ];
    });

    autoTable(doc, {
      head: [['Fecha', 'Horario', 'Aula', 'Usuario', 'Motivo']],
      body: body,
      startY: 22,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [86, 136, 206], textColor: [255, 255, 255] }
    });

    doc.save(`Horario_Lista_${scopeName.replace(/\s+/g, '_')}.pdf`);
  }
}
