import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { AuthStore } from '../../../../core/auth/auth.store';
import { stubNativeDialog } from '../../../../shared/testing/native-dialog-test';
import { DailyWeighingDetail, DailyWeighingOperation } from '../../interfaces/flock-weighing.interface';
import { FlockWeighingsService } from '../../services/flock-weighings.service';
import { FlockWeighingRecordPage } from './flock-weighing-record.page';

const record: DailyWeighingDetail = { id: 'day', flock_id: 'flock', date: '2020-01-02', status: 'closed', expected_range: null,
  version: 4, represented_bird_count: 4, total_weight_g: '400', average_weight_g: '100', anomalous_entry_count: 0,
  last_entry: null, next_cursor: null, entries: [
    { id: 'one', occurred_at: '2020-01-02T14:00:00Z', mode: 'individual', weight_g: '100', total_weight_g: '100', average_weight_g: '100', bird_count: 1, outside_expected_range: false },
    { id: 'group', occurred_at: '2020-01-02T14:05:00Z', mode: 'group', weight_g: null, total_weight_g: '300', average_weight_g: '100', bird_count: 3, outside_expected_range: false },
  ] };
describe('Weighing record entry deletion', () => {
  let fixture: ComponentFixture<FlockWeighingRecordPage>; let restore: () => void;
  const params = new BehaviorSubject(convertToParamMap({ id: 'flock', weighingId: 'day' }));
  const user = signal({ id: 1, roles: ['admin'], permissions: [] as string[] });
  const session = signal({ id: 'session-1' });
  const api = { getDaily: vi.fn(), deleteDailyEntry: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); restore = stubNativeDialog(); params.next(convertToParamMap({ id: 'flock', weighingId: 'day' }));
    user.set({ id: 1, roles: ['admin'], permissions: [] }); session.set({ id: 'session-1' });
    api.getDaily.mockReturnValue(of(record)); api.deleteDailyEntry.mockReturnValue(of({ operation_id: 'op', daily_weighing: record, deleted_entry_id: 'one' }));
    TestBed.configureTestingModule({ imports: [FlockWeighingRecordPage], providers: [
      provideRouter([]), { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: AuthStore, useValue: { user, session, isAdmin: () => user().roles.includes('admin') } },
      { provide: FlockWeighingsService, useValue: api },
    ] });
    fixture = TestBed.createComponent(FlockWeighingRecordPage); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); restore(); });
  const page = () => fixture.componentInstance;
  function open(id = 'one') {
    const trigger = fixture.nativeElement.querySelector('.delete-button') as HTMLButtonElement;
    page().openDelete(id, trigger); fixture.detectChanges();
  }
  it('offers deletion per entry including closed days and never edits or deletes the whole day', () => {
    expect(fixture.nativeElement.querySelectorAll('.measurement-card .delete-button')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('Editar');
    open('group');
    expect(fixture.nativeElement.querySelector('.delete-dialog').open).toBe(true);
    expect(fixture.nativeElement.querySelector('.delete-dialog').textContent).toContain('Grupal');
    page().closeDelete();
    expect(api.deleteDailyEntry).not.toHaveBeenCalled();
  });
  it('requires a bounded reason and an explicit confirmation, then reloads the recalculated sample', () => {
    const after = { ...record, version: 5, entries: [record.entries[1]], represented_bird_count: 3, total_weight_g: '300' };
    api.getDaily.mockReturnValue(of(after)); open();
    page().confirmDelete(); expect(api.deleteDailyEntry).not.toHaveBeenCalled();
    page().deleteReason.setValue(' Duplicado ');
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('.delete-dialog form').dispatchEvent(submit); fixture.detectChanges();
    expect(submit.defaultPrevented).toBe(true);
    expect(api.deleteDailyEntry).toHaveBeenCalledWith('day', 'one', { version: 4, reason: 'Duplicado' }, expect.any(String));
    expect(api.getDaily).toHaveBeenCalledTimes(2); expect(page().entries()).toEqual([record.entries[1]]);
    expect(page().record()?.represented_bird_count).toBe(3); expect(page().success()).toContain('recalculó');
  });
  it('locks duplicate confirmation, closing and pagination while the delete is pending', () => {
    const pending = new Subject<DailyWeighingOperation>(); api.deleteDailyEntry.mockReturnValue(pending);
    open(); page().deleteReason.setValue('Duplicado'); page().confirmDelete(); page().confirmDelete(); page().closeDelete(); page().loadMore();
    expect(api.deleteDailyEntry).toHaveBeenCalledOnce(); expect(fixture.nativeElement.querySelector('.delete-dialog').open).toBe(true);
    pending.next({ operation_id: 'op', daily_weighing: record, deleted_entry_id: 'one' }); fixture.detectChanges();
    expect(page().deleting()).toBe(false); expect(fixture.nativeElement.querySelector('.delete-dialog').open).toBe(false);
  });
  it('retries uncertain failures with the same key and changes the key when the reason changes', () => {
    api.deleteDailyEntry.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    open(); page().deleteReason.setValue('Duplicado'); page().confirmDelete(); page().confirmDelete();
    expect(api.deleteDailyEntry.mock.calls[1]).toEqual(api.deleteDailyEntry.mock.calls[0]);
    page().deleteReason.setValue('Otro motivo'); page().confirmDelete();
    expect(api.deleteDailyEntry.mock.calls[2][3]).not.toBe(api.deleteDailyEntry.mock.calls[0][3]);
  });
  it('shows conflicts without automatic retries and refreshes data when the user closes the confirmation', () => {
    api.deleteDailyEntry.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'La muestra cambió.' } })));
    open(); page().deleteReason.setValue('Duplicado'); page().confirmDelete(); page().confirmDelete();
    expect(api.deleteDailyEntry).toHaveBeenCalledOnce(); expect(page().deleteError()).toBe('La muestra cambió.');
    expect(page().deleteBlocked()).toBe(true); page().closeDelete();
    expect(api.getDaily).toHaveBeenCalledTimes(2); expect(page().deleteTarget()).toBeNull();
  });
  it('enforces permissions and invalidates the confirmation on a same-user session change', () => {
    open(); page().deleteReason.setValue('Duplicado'); session.set({ id: 'session-2' }); page().confirmDelete();
    expect(api.deleteDailyEntry).not.toHaveBeenCalled(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.delete-dialog').open).toBe(false);
    user.set({ id: 1, roles: [], permissions: ['weighings.view'] }); fixture.detectChanges(); open();
    expect(page().deleteTarget()).toBeNull(); expect(fixture.nativeElement.querySelector('.measurement-card .delete-button')).toBeNull();
  });
  it('ignores a deleted entry response after navigating to another lot', () => {
    const pending = new Subject<DailyWeighingOperation>(); api.deleteDailyEntry.mockReturnValue(pending);
    open(); page().deleteReason.setValue('Duplicado'); page().confirmDelete();
    api.getDaily.mockReturnValue(of({ ...record, id: 'other-day', flock_id: 'other' }));
    params.next(convertToParamMap({ id: 'other', weighingId: 'other-day' }));
    pending.next({ operation_id: 'old', daily_weighing: record, deleted_entry_id: 'one' }); fixture.detectChanges();
    expect(page().record()?.flock_id).toBe('other'); expect(page().success()).toBe('');
  });
  it('rejects a daily record from another flock and keeps pagination failures independent', () => {
    api.getDaily.mockReturnValueOnce(of({ ...record, flock_id: 'other' })); page().load();
    expect(page().state()).toBe('not-found');
    api.getDaily.mockReturnValueOnce(of({ ...record, next_cursor: 'cursor-2' })); page().load();
    api.getDaily.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    page().loadMore(); expect(page().entries()).toHaveLength(2); expect(page().loadMoreError()).toBe(true);
  });
});
