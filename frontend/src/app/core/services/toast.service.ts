import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  dismissible: boolean;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  private defaultDurations: Record<ToastType, number> = {
    success: 3000,
    error: 5000,
    warning: 4000,
    info: 3000
  };

  show(options: Partial<Omit<Toast, 'id'>>): string {
    const id = this.generateId();
    const toast: Toast = {
      id,
      type: options.type || 'info',
      title: options.title || '',
      message: options.message,
      duration: options.duration || this.defaultDurations[options.type || 'info'],
      dismissible: options.dismissible !== false
    };

    this.toastsSignal.update(toasts => [...toasts, toast]);

    if (toast.duration > 0) {
      setTimeout(() => this.dismiss(id), toast.duration);
    }

    return id;
  }

  success(title: string, message?: string): string {
    return this.show({ type: 'success', title, message });
  }

  error(title: string, message?: string): string {
    return this.show({ type: 'error', title, message, duration: 5000 });
  }

  warning(title: string, message?: string): string {
    return this.show({ type: 'warning', title, message });
  }

  info(title: string, message?: string): string {
    return this.show({ type: 'info', title, message });
  }

  dismiss(id: string): void {
    this.toastsSignal.update(toasts => toasts.filter(t => t.id !== id));
  }

  clear(): void {
    this.toastsSignal.set([]);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
