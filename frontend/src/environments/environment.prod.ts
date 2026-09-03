/**
 * Production environment config. Swapped in for environment.ts at build
 * time via the `fileReplacements` entry under the "production" build
 * configuration in angular.json - app code always imports from
 * '../environments/environment' and never needs to know which one is active.
 */
export const environment = {
  production: true,
  // TODO: point this at your deployed backend's URL before shipping.
  apiBaseUrl: 'https://your-backend-domain.example.com',
};
