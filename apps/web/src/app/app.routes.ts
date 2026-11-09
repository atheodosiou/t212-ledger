import { Routes } from '@angular/router';
import { signedIn, signedOut } from './core/auth';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Σύνδεση · t212 ledger',
    canMatch: [signedOut],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'privacy',
    title: 'Απόρρητο · t212 ledger',
    loadComponent: () => import('./pages/privacy/privacy.page').then((m) => m.PrivacyPage),
  },
  {
    path: 'unavailable',
    title: 'Ο server δεν απαντά · t212 ledger',
    loadComponent: () =>
      import('./pages/unavailable/unavailable.page').then((m) => m.UnavailablePage),
  },
  {
    path: '',
    canMatch: [signedIn],
    children: [
      {
        path: '',
        title: 'Λογαριασμοί · t212 ledger',
        loadComponent: () => import('./pages/accounts/accounts.page').then((m) => m.AccountsPage),
      },
      {
        path: 'settings',
        title: 'Ο λογαριασμός μου · t212 ledger',
        loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'taxes',
        title: 'Φόροι · t212 ledger',
        loadComponent: () => import('./pages/taxes/taxes.page').then((m) => m.TaxesPage),
      },
      {
        path: 'taxes/instruments',
        title: 'Κατηγορίες τίτλων · t212 ledger',
        loadComponent: () =>
          import('./pages/taxes/tax-instruments.page').then((m) => m.TaxInstrumentsPage),
      },
      {
        path: 'accounts/:id',
        title: 'Λογαριασμός · t212 ledger',
        loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'accounts/:id/accountant',
        title: 'Για τον λογιστή · t212 ledger',
        loadComponent: () =>
          import('./pages/accountant/accountant.page').then((m) => m.AccountantPage),
      },
      {
        path: 'accounts/:id/timeline',
        title: 'Χρονολόγιο · t212 ledger',
        loadComponent: () => import('./pages/timeline/timeline.page').then((m) => m.TimelinePage),
      },
    ],
  },
  // Anything else: the accounts page, or the sign-in page for someone signed out.
  { path: '**', redirectTo: '' },
];
