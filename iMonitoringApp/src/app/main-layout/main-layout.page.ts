import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterModule, NavigationEnd, IsActiveMatchOptions, ActivatedRoute } from '@angular/router';
import { IonicModule, Platform, PopoverController, NavController, MenuController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service'
import { Rol } from '../models/rol.model';
import { User } from '../models/user.model';
import { Subject } from 'rxjs';
import { filter, takeUntil, take } from 'rxjs/operators';
import { SettingsPanelComponent } from '../components/settings-panel/settings-panel.component';
import { MobileActionsPopoverComponent } from '../components/mobile-actions-popover/mobile-actions-popover.component';

interface NavLink {
  title: string;
  icon?: string;
  route?: string;
  roles?: Rol[];
  isActive?: boolean;
}

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.page.html',
  styleUrls: ['./main-layout.page.scss'],
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    RouterModule,
    SettingsPanelComponent,
    MobileActionsPopoverComponent,
  ],
})
export class MainLayoutPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  appName = 'AulaMonitor';
  userRole: Rol | null = null;
  currentUser: User | null = null;
  currentPageTitle: string = 'AulaMonitor';

  isSettingsPanelOpen = false;
  isNotificationsPanelOpen = false;
  isSearchPanelOpen = false;
  public showPageLoading: boolean = false;

  allNavLinks: NavLink[] = [];
  filteredNavLinks: NavLink[] = [];

  constructor(
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private popoverCtrl: PopoverController,
    private platform: Platform,
    private navCtrl: NavController,
    private cdr: ChangeDetectorRef,
    private menuCtrl: MenuController
  ) {}

  ngOnInit() {
    this.authService.getCurrentUserRole().pipe(takeUntil(this.destroy$)).subscribe((role: Rol | null) => {
      this.userRole = role;
      this.setupNavLinks();
      this.updateFilteredNavLinks();
    });

    this.authService.getCurrentUser().pipe(takeUntil(this.destroy$)).subscribe((user: User | null) => {
      this.currentUser = user;
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe((event: NavigationEnd) => {
      this.updateLinkActiveStates();
      this.updatePageTitle();
      if (this.platform.is('mobile')) {
        this.menuCtrl.close();
      }
    });
    this.updatePageTitle();
  }

  private setupNavLinks() {
    this.allNavLinks = [
      { title: 'Dashboard', icon: 'home-outline', route: '/app/dashboard', roles: [Rol.ADMIN, Rol.PROFESOR, Rol.TUTOR, Rol.ESTUDIANTE, Rol.COORDINADOR] },
      { title: 'Mis Reservas', icon: 'calendar-outline', route: '/app/reservations/my-list', roles: [Rol.ADMIN, Rol.PROFESOR, Rol.TUTOR, Rol.ESTUDIANTE, Rol.COORDINADOR] },
      { title: 'Nueva Reserva', icon: 'add-circle-outline', route: '/app/reservations/new', roles: [Rol.ADMIN, Rol.PROFESOR, Rol.TUTOR, Rol.ESTUDIANTE, Rol.COORDINADOR] },
      { title: 'Disponibilidad', icon: 'time-outline', route: '/app/classrooms/availability', roles: [Rol.ADMIN, Rol.PROFESOR, Rol.TUTOR, Rol.ESTUDIANTE, Rol.COORDINADOR] },
      { title: 'Estudiantes', icon: 'people-outline', route: '/app/users', roles: [Rol.COORDINADOR] },
      { title: 'Reservas Estudiantes', icon: 'documents-outline', route: '/app/reservations/all', roles: [Rol.COORDINADOR] },
      { title: 'Auditoría (Logs)', icon: 'document-text-outline', route: '/app/admin/logs', roles: [Rol.ADMIN, Rol.COORDINADOR] },
      { title: 'Edificios', icon: 'business-outline', route: '/app/buildings', roles: [Rol.ADMIN] },
      { title: 'Aulas', icon: 'school-outline', route: '/app/classrooms', roles: [Rol.ADMIN] },
      { title: 'Usuarios', icon: 'people-circle-outline', route: '/app/users', roles: [Rol.ADMIN] },
      { title: 'Mi Perfil', icon: 'person-outline', route: '/app/profile', roles: [Rol.ADMIN, Rol.PROFESOR, Rol.TUTOR, Rol.ESTUDIANTE, Rol.COORDINADOR] },
    ];
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  updateFilteredNavLinks() {
    if (!this.userRole) {
      this.filteredNavLinks = [];
      return;
    }

    this.filteredNavLinks = this.allNavLinks.filter(link => {
      return link.roles && link.roles.includes(this.userRole as Rol);
    }).map(link => ({
      ...link,
      isActive: link.route ? this.router.isActive(link.route, this.getIsActiveMatchOptions(link.route)) : false
    }));

    this.cdr.detectChanges();
  }

  getIsActiveMatchOptions(route: string): IsActiveMatchOptions {
    if (route.includes('/new') || route.match(/\/:id($|\/edit)/)) {
      return { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' };
    }
    return { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' };
  }

  updateLinkActiveStates() {
    this.filteredNavLinks = this.filteredNavLinks.map(link => ({
      ...link,
      isActive: link.route ? this.router.isActive(link.route, this.getIsActiveMatchOptions(link.route)) : false
    }));
    this.cdr.detectChanges();
  }

  updatePageTitle() {
    const activeLink = this.filteredNavLinks.find(link => link.isActive);
    this.currentPageTitle = activeLink?.title || this.appName;

    let route = this.activatedRoute;
    while (route.firstChild) {
      route = route.firstChild;
    }

    route.data.pipe(take(1)).subscribe((data: any) => {
      this.currentPageTitle = data['title'] || this.currentPageTitle;
      this.cdr.detectChanges();
    });
  }

  isLinkActive(link?: NavLink): boolean {
    if (!link || !link.route) return false;
    return this.router.isActive(link.route, this.getIsActiveMatchOptions(link.route));
  }

  openPanel(panelName: 'settings' | 'notifications' | 'search') {
    if (panelName === 'settings') this.isSettingsPanelOpen = true;
    else if (panelName === 'notifications') this.isNotificationsPanelOpen = true;
    else if (panelName === 'search') this.isSearchPanelOpen = true;
  }

  closePanel(panelName: 'settings' | 'notifications' | 'search') {
    if (panelName === 'settings') this.isSettingsPanelOpen = false;
    else if (panelName === 'notifications') this.isNotificationsPanelOpen = false;
    else if (panelName === 'search') this.isSearchPanelOpen = false;
  }

  async openMobileSubMenu(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: MobileActionsPopoverComponent,
      event: ev,
      translucent: true,
      dismissOnSelect: true,
    });

    popover.onDidDismiss().then((detail) => {
      if (detail && detail.data && detail.data.action) {
        this.handlePopoverAction(detail.data.action);
      }
    });
    await popover.present();
  }

  handlePopoverAction(action: string) {
    switch (action) {
      case 'notifications': this.openPanel('notifications'); break;
      case 'search': this.openPanel('search'); break;
      case 'settings': this.openPanel('settings'); break;
      case 'profile': this.navigateToProfile(); break;
      case 'logout': this.logout(); break;
    }
  }

  navigateToProfile() {
    this.navCtrl.navigateForward('/app/profile');
    this.menuCtrl.close();
  }

  triggerDesktopLogout() {
    this.logout();
  }

  logout() {
    this.authService.logout();
    this.menuCtrl.close();
  }
}
