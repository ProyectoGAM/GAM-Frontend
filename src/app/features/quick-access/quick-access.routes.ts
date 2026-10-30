import { Routes } from '@angular/router';
import type { QuickAccessPage } from './pages/quick-access/quick-access.page';

export const quickAccessRoutes: Routes = [{
  path: '',
  loadComponent: () => import('./pages/quick-access/quick-access.page').then((module) => module.QuickAccessPage),
  canDeactivate: [(page: QuickAccessPage) => page.canLeave()],
}];
