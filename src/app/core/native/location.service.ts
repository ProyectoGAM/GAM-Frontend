import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { Injectable } from '@angular/core';

export interface LocationSample {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  capturedAt: string;
}

type LocationWatch = string | number;

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly native = Capacitor.isNativePlatform();

  async watch(onSample: (sample: LocationSample) => void, onError: (error: unknown) => void): Promise<LocationWatch> {
    if (this.native) {
      return Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
        (position, error) => error ? onError(error) : position && onSample(this.sample(position)),
      );
    }

    if (!globalThis.navigator?.geolocation) throw new Error('Este dispositivo no expone GPS.');

    return globalThis.navigator.geolocation.watchPosition(
      (position) => onSample(this.sample(position)),
      onError,
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  async clearWatch(id: LocationWatch): Promise<void> {
    if (this.native) {
      await Geolocation.clearWatch({ id: String(id) });
      return;
    }

    if (typeof id === 'number') globalThis.navigator.geolocation.clearWatch(id);
  }

  async requestPermission(): Promise<void> {
    if (this.native) await Geolocation.requestPermissions();
  }

  private sample(position: Position | globalThis.GeolocationPosition): LocationSample {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  }
}
