import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular';

@Component({
  selector: 'app-poultry-house-future-page',
  template: `<main class="future-page"><h1>Detalle de galpón</h1><p>Esta pantalla se implementará en una etapa futura.</p><ion-button [routerLink]="['/administracion/ubicaciones/unidades-productivas', unitId]">Volver a la unidad productiva</ion-button></main>`,
  styles: [`:host{display:block;color:var(--gam-color-text)}.future-page{max-width:680px;margin-inline:auto;padding:24px;border:1px solid var(--gam-color-border);border-radius:12px;background:var(--gam-color-surface)}h1{margin-top:0;color:var(--gam-color-heading)}p{color:var(--gam-color-text-muted)}ion-button{--background:var(--gam-color-primary);--color:var(--gam-color-on-primary)}`],
  imports: [IonButton, RouterLink],
})
export class PoultryHouseFuturePage {
  readonly unitId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
}
