import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';

import { AuthStore } from '../../core/auth/auth.store';
import { postLoginPath } from '../../core/auth/access-policy';

@Component({
  selector: 'app-access-denied',
  template: `<ion-content class="ion-padding"><main><p>403 · Acceso restringido</p><h1>No tienes acceso a esta sección</h1><span>Tu sesión está activa, pero tu cuenta no tiene permisos para abrir este módulo.</span>@if (returnPath(); as path) { <ion-button [routerLink]="path">{{ path === '/repartidor' ? 'Abrir modo repartidor' : 'Volver al panel' }}</ion-button> }<ion-button fill="outline" (click)="logout()">Cerrar sesión</ion-button></main></ion-content>`,
  styles: [`ion-content{--background:var(--gam-color-canvas)}main{width:min(100%,520px);margin:clamp(50px,16vh,150px) auto;padding:28px;color:var(--gam-color-text)}p{color:var(--gam-color-primary);font-size:12px;font-weight:800;letter-spacing:.1em}h1{margin:10px 0;font-size:30px;color:var(--gam-color-heading)}span{display:block;color:var(--gam-color-text-muted);line-height:1.5}ion-button{margin:22px 12px 0 0;--background:var(--gam-color-primary);--color:var(--gam-color-on-primary)}ion-button[fill="outline"]{--background:transparent;--color:var(--gam-color-primary);--border-color:var(--gam-color-primary)}`],
  imports: [IonButton, IonContent, RouterLink],
})
export class AccessDeniedPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  readonly returnPath = computed(() => {
    const path = postLoginPath(this.auth.user());
    return path === '/acceso-denegado' ? null : path;
  });

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
