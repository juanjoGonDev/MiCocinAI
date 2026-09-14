import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'difficulty',
  standalone: true
})
export class DifficultyPipe implements PipeTransform {
  private readonly labels: Record<string, string> = {
    easy: 'Fácil',
    medium: 'Medio',
    hard: 'Difícil'
  };

  private readonly icons: Record<string, string> = {
    easy: '🟢',
    medium: '🟡',
    hard: '🔴'
  };

  transform(value: string | null | undefined, showIcon = false): string {
    if (!value) return '';

    const label = this.labels[value.toLowerCase()] || value;
    const icon = this.icons[value.toLowerCase()] || '';

    return showIcon ? `${icon} ${label}` : label;
  }
}
