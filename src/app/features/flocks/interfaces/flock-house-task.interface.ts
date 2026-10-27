import { FlockHouseOrigin } from './flock-detail.interface';

export interface FlockHouseTaskAction {
  kind: 'mortality' | 'feeding';
  flockId: string;
  trigger: HTMLElement | null;
}

export interface FlockHouseTaskRequest extends FlockHouseTaskAction {
  origin: FlockHouseOrigin;
  houseName: string;
  unitName: string;
}
