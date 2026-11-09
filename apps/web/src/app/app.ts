import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { ToastHost } from './ui/toast-host';
import { UserMenu } from './ui/user-menu';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, UserMenu, ToastHost],
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(Auth);
}
