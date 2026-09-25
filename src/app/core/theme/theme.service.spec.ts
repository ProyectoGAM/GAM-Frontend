import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService } from './theme.service';

const THEME_PREFERENCE_KEY = 'gam.theme.preference.v1';

describe('ThemeService', () => {
  let service: ThemeService;
  let systemThemeListener: ((event: MediaQueryListEvent) => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem(THEME_PREFERENCE_KEY);
    document.documentElement.classList.remove('ion-palette-dark');
    document.documentElement.style.removeProperty('color-scheme');
    systemThemeListener = undefined;
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.removeItem(THEME_PREFERENCE_KEY);
    document.documentElement.classList.remove('ion-palette-dark');
    document.documentElement.style.removeProperty('color-scheme');
    vi.restoreAllMocks();
  });

  it('loads a saved preference without consulting the operating system', () => {
    localStorage.setItem(THEME_PREFERENCE_KEY, 'dark');
    const matchMedia = vi.spyOn(window, 'matchMedia');

    service.initialize();

    expect(service.isDarkMode()).toBe(true);
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it('follows system changes until the first toggle, then persists the selection', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        systemThemeListener = listener as (event: MediaQueryListEvent) => void;
      },
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList);

    service.initialize();
    expect(service.isDarkMode()).toBe(true);
    expect(service.toggleIcon()).toBe('sunny-outline');
    expect(service.toggleLabel()).toBe('Cambiar a tema claro');

    systemThemeListener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isDarkMode()).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');

    service.toggle();
    expect(service.isDarkMode()).toBe(true);
    expect(localStorage.getItem(THEME_PREFERENCE_KEY)).toBe('dark');

    systemThemeListener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isDarkMode()).toBe(true);
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
  });
});
