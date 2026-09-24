import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular';

@Component({
  selector: 'app-admin-placeholder',
  template: `<div class="heading"><div><p>Panel administrativo / {{ groupLabel }}</p><h1>{{ title }}</h1></div><span>Módulo pendiente de implementación</span></div><ion-card><ion-card-header><ion-card-title>{{ title }}</ion-card-title></ion-card-header><ion-card-content><p>Módulo pendiente de implementación.</p><ion-button fill="outline" routerLink="/home">Volver al inicio</ion-button></ion-card-content></ion-card>`,
  styles: [`.heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:0 0 22px}.heading p{margin:0 0 7px;color:#788695;font-size:12px}.heading h1{margin:0;font-size:clamp(23px,3vw,31px);color:#17365d}.heading>span{padding:7px 10px;border:1px solid #d6e2ee;border-radius:5px;color:#536d87;background:#f7f9fb;font-size:11px;font-weight:700}ion-card{margin:0;--background:#fff;border:1px solid #dce3ea;border-radius:7px;box-shadow:none}ion-card-title{color:#17365d}ion-card-content p{color:#657587}`],
  imports: [IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, RouterLink],
})
export class AdminPlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  readonly title = this.route.snapshot.data['title'] as string;
  readonly groupLabel = this.route.snapshot.data['groupLabel'] as string;
}
