import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

type ThemePreference = 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'gam.theme.preference.v1';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly darkMode = signal(false);
  private initialized = false;
  private hasPreference = false;

  readonly isDarkMode = this.darkMode.asReadonly();
  readonly toggleLabel = computed(() => this.darkMode() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  readonly toggleIcon = computed(() => this.darkMode() ? 'sunny-outline' : 'moon-outline');

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const stored = this.readPreference();
    if (stored) {
      this.hasPreference = true;
      this.apply(stored === 'dark');
      return;
    }

    const view = this.document.defaultView;
    if (!view?.matchMedia) {
      this.apply(false);
      return;
    }

    const mediaQuery = view.matchMedia('(prefers-color-scheme: dark)');
    this.apply(mediaQuery.matches);
    mediaQuery.addEventListener('change', this.handleSystemChange);
  }

  toggle(): void {
    const next = !this.darkMode();
    this.hasPreference = true;
    this.apply(next);

    try {
      this.document.defaultView?.localStorage.setItem(THEME_PREFERENCE_KEY, next ? 'dark' : 'light');
    } catch {
      // Keep the selected theme for this session when storage is unavailable.
    }
  }

  private readonly handleSystemChange = (event: MediaQueryListEvent): void => {
    if (!this.hasPreference) this.apply(event.matches);
  };

  private readPreference(): ThemePreference | null {
    try {
      const stored = this.document.defaultView?.localStorage.getItem(THEME_PREFERENCE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }

  private apply(isDark: boolean): void {
    this.darkMode.set(isDark);
    const root = this.document.documentElement;
    root.classList.toggle('ion-palette-dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }
}
