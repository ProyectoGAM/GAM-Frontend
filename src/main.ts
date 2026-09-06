import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideAppInitializer } from '@angular/core';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { API_CONFIG } from './app/core/config/api.config';
import { authInterceptor } from './app/core/auth/auth.interceptor';
import { AuthStore } from './app/core/auth/auth.store';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy,
    },

    provideIonicAngular(),

    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
    ),

    provideHttpClient(withInterceptors([authInterceptor])),

    provideAppInitializer(() => inject(AuthStore).bootstrap()),

    {
      provide: API_CONFIG,
      useValue: {
        baseUrl: environment.apiUrl,
      },
    },
  ],
});
