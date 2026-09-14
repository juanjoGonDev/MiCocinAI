import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private loadingSignal = signal<boolean>(false);
  private loadingMapSignal = signal<Map<string, boolean>>(new Map());

  readonly isLoading = this.loadingSignal.asReadonly();

  start(key?: string): void {
    if (key) {
      this.loadingMapSignal.update(map => {
        const newMap = new Map(map);
        newMap.set(key, true);
        return newMap;
      });
    }
    this.loadingSignal.set(true);
  }

  stop(key?: string): void {
    if (key) {
      this.loadingMapSignal.update(map => {
        const newMap = new Map(map);
        newMap.delete(key);
        return newMap;
      });
    }

    const map = this.loadingMapSignal();
    this.loadingSignal.set(map.size > 0);
  }

  isLoadingKey(key: string): boolean {
    return this.loadingMapSignal().has(key);
  }

  reset(): void {
    this.loadingSignal.set(false);
    this.loadingMapSignal.set(new Map());
  }
}
