import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([errorInterceptor])),
    providePrimeNG({
      theme: {
        preset: Aura,
        // Sigue el modo claro/oscuro del sistema, igual que los tokens de styles.scss.
        options: { darkModeSelector: 'system' },
      },
    }),
    // PrimeNG no lo registra por sí mismo: lo usa <p-toast> y NotificationService.
    MessageService,
  ],
};
