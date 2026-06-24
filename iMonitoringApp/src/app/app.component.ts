import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonicModule, Platform } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ThemeService } from './services/theme.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonicModule, RouterModule, CommonModule],
})
export class AppComponent {
  constructor(
    private platform: Platform,
    private themeService: ThemeService,
    private authService: AuthService
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(async () => {
      this.themeService.initializeTheme();
      await this.authService.loadToken();
    });
  }
}
