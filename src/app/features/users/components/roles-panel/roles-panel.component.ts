import { afterNextRender, afterRenderEffect, Component, DestroyRef, effect, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, closeOutline, createOutline, informationCircleOutline, lockClosedOutline, peopleOutline, refreshOutline, searchOutline, shieldCheckmarkOutline, trashOutline } from 'ionicons/icons';

import { RoleMetadata } from '../../interfaces/role-management.interface';
import { RolesService } from '../../services/roles.service';

type RoleDialog = 'selection' | 'review' | 'metadata' | 'delete' | 'discard' | null;

@Component({
  selector: 'app-user-roles-panel',
  templateUrl: './roles-panel.component.html',
  styleUrl: './roles-panel.component.scss',
  imports: [ReactiveFormsModule, IonIcon, IonSpinner],
  providers: [RolesService],
})
export class RolesPanelComponent {
  readonly state = inject(RolesService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialogElement = viewChild.required<ElementRef<HTMLDialogElement>>('roleDialog');
  private readonly dialogTitle = viewChild.required<ElementRef<HTMLElement>>('dialogTitle');
  private readonly editorTitle = viewChild<ElementRef<HTMLElement>>('editorTitle');
  private readonly listTitle = viewChild<ElementRef<HTMLElement>>('listTitle');
  readonly dialog = signal<RoleDialog>(null);
  readonly reviewMetadata = signal<RoleMetadata | null>(null);
  readonly search = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] });
  readonly details = new FormGroup({
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    descripcion: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });
  private returnFocus: HTMLElement | null = null;
  private leaveResolver: ((leave: boolean) => void) | null = null;
  private resumeDialog: RoleDialog = null;

  constructor() {
    addIcons({ addOutline, arrowBackOutline, businessOutline, checkmarkCircleOutline, chevronForwardOutline, closeOutline, createOutline, informationCircleOutline, lockClosedOutline, peopleOutline, refreshOutline, searchOutline, shieldCheckmarkOutline, trashOutline });
    effect(() => {
      if (!this.state.canManage() || !this.state.editor()) {
        this.details.reset(); this.reviewMetadata.set(null); this.dialog.set(null);
        this.resumeDialog = null;
        this.leaveResolver?.(true); this.leaveResolver = null;
      }
      if (this.state.pendingSelection()) this.dialog.set('selection');
    });
    afterRenderEffect(() => {
      const mode = this.dialog(); const element = this.dialogElement().nativeElement;
      if (mode) {
        if (!element.open) {
          this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          element.showModal();
        }
        this.dialogTitle().nativeElement.focus({ preventScroll: true });
      } else if (element.open) {
        element.close();
        if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
        this.returnFocus = null;
      }
    });
    this.destroyRef.onDestroy(() => { this.leaveResolver?.(true); this.details.reset(); });
    void this.state.loadList(); void this.state.loadCatalog();
  }

  async open(id: number | null): Promise<void> {
    this.details.reset(); this.reviewMetadata.set(null);
    await this.state.open(id);
    if (!this.destroyRef.destroyed) afterNextRender(() => this.editorTitle()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  searchRoles(): void {
    this.search.markAsTouched();
    if (this.search.valid) void this.state.loadList(this.search.value, 1);
  }

  clearSearch(): void { this.search.reset(); void this.state.loadList('', 1); }

  toggle(event: Event, name: string): void {
    const input = event.target as HTMLInputElement;
    this.state.togglePermission(name, input.checked);
    input.checked = this.state.selectedSet().has(name);
  }

  closeDialog(event?: Event): void {
    event?.preventDefault();
    if (this.state.busy()) return;
    if (this.dialog() === 'discard') {
      this.leaveResolver?.(false); this.leaveResolver = null;
      this.dialog.set(this.resumeDialog); this.resumeDialog = null;
      return;
    }
    this.state.pendingSelection.set(null); this.dialog.set(null); this.reviewMetadata.set(null);
    if (!this.state.creating()) this.details.reset();
  }

  acceptSelection(): void { this.state.acceptSelection(); this.dialog.set(null); }

  openMetadata(): void {
    const role = this.state.selected();
    if (!role || this.state.readOnly() || this.state.busy() || this.state.blocked()) return;
    this.details.reset({ nombre: role.nombre, descripcion: role.descripcion ?? '' });
    this.dialog.set('metadata');
  }

  private metadata(): RoleMetadata | null {
    this.details.markAllAsTouched();
    const value = this.details.getRawValue();
    if (this.details.invalid || !value.nombre.trim()) return null;
    return { nombre: value.nombre.trim(), descripcion: value.descripcion.trim() || null };
  }

  review(): void {
    if (!this.state.canReview()) return;
    if (this.state.creating()) {
      const metadata = this.metadata(); if (!metadata) return;
      this.reviewMetadata.set(metadata);
    }
    this.dialog.set('review');
  }

  async save(): Promise<void> {
    let saved = false;
    if (this.dialog() === 'metadata') {
      const metadata = this.metadata(); if (!metadata) return;
      saved = await this.state.saveMetadata(metadata);
    } else if (this.dialog() === 'review') {
      saved = this.state.creating() && this.reviewMetadata() ? await this.state.create(this.reviewMetadata()!) : await this.state.savePermissions();
    } else if (this.dialog() === 'delete') saved = await this.state.deleteRole();
    if (saved || this.state.blocked()) this.closeDialog();
  }

  compareDraft(): void { this.state.adoptLatest(true); this.review(); }

  hasUnsaved(): boolean { return this.state.dirty() || ((this.state.creating() || this.dialog() === 'metadata' || this.resumeDialog === 'metadata') && this.details.dirty); }

  canLeave(): Promise<boolean> {
    if (!this.state.canManage()) return Promise.resolve(true);
    if (this.state.busy()) return Promise.resolve(false);
    if (!this.hasUnsaved()) return Promise.resolve(true);
    if (this.leaveResolver) return Promise.resolve(false);
    this.resumeDialog = this.dialog() === 'metadata' ? 'metadata' : null;
    this.state.pendingSelection.set(null); this.dialog.set('discard');
    return new Promise<boolean>((resolve) => { this.leaveResolver = resolve; });
  }

  discard(): void {
    this.leaveResolver?.(true); this.leaveResolver = null;
    this.dialog.set(null); this.resumeDialog = null; this.reviewMetadata.set(null); this.details.reset();
  }

  async back(): Promise<void> {
    if (!await this.canLeave()) return;
    this.state.back(); this.details.reset();
    if (!this.destroyRef.destroyed) afterNextRender(() => this.listTitle()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsaved() || this.state.busy()) { event.preventDefault(); event.returnValue = ''; }
  }
}
