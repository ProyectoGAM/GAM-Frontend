import { FlockHouseOrigin } from './flock-detail.interface';

export interface FlockHouseTaskAction {
  kind: 'collection' | 'mortality' | 'feeding' | 'health' | 'beak-trimming';
  flockId: string;
  trigger: HTMLElement | null;
}

export interface FlockHouseTaskRequest extends FlockHouseTaskAction {
  origin: FlockHouseOrigin;
  houseName: string;
  unitName: string;
}
