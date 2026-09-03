import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Makes HttpClient injectable app-wide - this is what ApiService uses
    // under the hood to make requests to the FastAPI backend.
    provideHttpClient(),
  ],
};
