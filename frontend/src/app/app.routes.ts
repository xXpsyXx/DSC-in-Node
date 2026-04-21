import { Routes } from '@angular/router';
import { ServiceDashboardComponent } from './components/service-dashboard.component';

export const routes: Routes = [
  { path: '', component: ServiceDashboardComponent },
  { path: 'dashboard', component: ServiceDashboardComponent },
  { path: '**', redirectTo: '' },
];
