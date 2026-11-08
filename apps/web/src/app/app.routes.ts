import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Λογαριασμοί · t212 ledger',
    loadComponent: () => import('./pages/accounts/accounts.page').then((m) => m.AccountsPage),
  },
  {
    path: 'accounts/:id',
    title: 'Λογαριασμός · t212 ledger',
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: 'accounts/:id/accountant',
    title: 'Για τον λογιστή · t212 ledger',
    loadComponent: () => import('./pages/accountant/accountant.page').then((m) => m.AccountantPage),
  },
  {
    path: 'accounts/:id/timeline',
    title: 'Χρονολόγιο · t212 ledger',
    loadComponent: () => import('./pages/timeline/timeline.page').then((m) => m.TimelinePage),
  },
  { path: '**', redirectTo: '' },
];
