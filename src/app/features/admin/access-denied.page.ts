import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';

@Component({
  selector: 'app-access-denied',
  template: `<ion-content class="ion-padding"><main><p>403 · Acceso restringido</p><h1>No tienes acceso a esta sección</h1><span>Tu sesión está activa, pero tu cuenta no tiene permisos para abrir este módulo.</span><ion-button routerLink="/home">Volver al inicio</ion-button></main></ion-content>`,
  styles: [`main{width:min(100%,520px);margin:clamp(50px,16vh,150px) auto;padding:28px;color:#263546}p{color:#285f91;font-size:12px;font-weight:800;letter-spacing:.1em}h1{margin:10px 0;font-size:30px}span{display:block;color:#718091;line-height:1.5}ion-button{margin:22px 0 0}`],
  imports: [IonButton, IonContent, RouterLink],
})
export class AccessDeniedPage {}
