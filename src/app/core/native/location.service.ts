import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

const POSITION_OPTIONS = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 };
const PERMISSION_MESSAGE = 'Permití el acceso a tu ubicación para centrar el mapa.';
const UNAVAILABLE_MESSAGE = 'No pudimos obtener tu ubicación. Revisá si la ubicación está activada y volvé a intentar.';

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly native = Capacitor.isNativePlatform();

  async getCurrentPosition(): Promise<LocationCoordinates> {
    const { coords: { latitude, longitude } } = await (this.native ? this.nativePosition() : this.browserPosition());
    return { latitude, longitude };
  }

  private async nativePosition() {
    try {
      let permissions = await Geolocation.checkPermissions();
      if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
        permissions = await Geolocation.requestPermissions();
        if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
          throw new Error(PERMISSION_MESSAGE);
        }
      }
      return await Geolocation.getCurrentPosition({ ...POSITION_OPTIONS, enableHighAccuracy: permissions.location === 'granted' });
    } catch (error) {
      if (error instanceof Error && error.message === PERMISSION_MESSAGE) throw error;
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      throw new Error(code === 'OS-PLUG-GLOC-0003' ? PERMISSION_MESSAGE : UNAVAILABLE_MESSAGE);
    }
  }

  private async browserPosition(): Promise<GeolocationPosition> {
    if (!globalThis.isSecureContext) throw new Error('Abrí GAM por HTTPS para usar tu ubicación.');
    const geolocation = globalThis.navigator?.geolocation;
    if (!geolocation) throw new Error('Este navegador no permite acceder a tu ubicación.');
    return new Promise((resolve, reject) => {
      geolocation.getCurrentPosition(resolve, (error) => {
        reject(new Error(error.code === error.PERMISSION_DENIED ? PERMISSION_MESSAGE : UNAVAILABLE_MESSAGE));
      }, POSITION_OPTIONS);
    });
  }
}
