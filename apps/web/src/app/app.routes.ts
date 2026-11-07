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
  { path: '**', redirectTo: '' },
];
