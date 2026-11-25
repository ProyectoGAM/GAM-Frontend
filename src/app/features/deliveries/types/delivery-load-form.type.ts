import type { FormArray, FormControl, FormGroup } from '@angular/forms';

export type DeliveryStartMode = 'loaded' | 'empty';
export type LoadLineForm = FormGroup<{ unit: FormControl<string>; amount: FormControl<string> }>;
export type LoadForm = FormGroup<{ items: FormArray<LoadLineForm>; production_unit_id: FormControl<number | null> }>;
