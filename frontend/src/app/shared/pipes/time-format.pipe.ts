import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'timeFormat',
  standalone: true
})
export class TimeFormatPipe implements PipeTransform {
  transform(value: number | null | undefined, format: 'timer' | 'minutes' = 'timer'): string {
    if (value == null || value < 0) {
      return format === 'timer' ? '00:00' : '0 min';
    }

    if (format === 'minutes') {
      if (value < 60) {
        return `${value} min`;
      }
      const hours = Math.floor(value / 60);
      const mins = value % 60;
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }

    // Timer format mm:ss
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
