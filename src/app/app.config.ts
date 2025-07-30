import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from "@angular/core";
import { provideRouter } from "@angular/router";
import { provideHttpClient } from "@angular/common/http"; // 💡 Importa HttpClient

import { routes } from "./app.routes";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { NgxSpinViewerModule, NgxPanoViewerModule } from "@egjs/ngx-view360";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(), // 💡 Agrega esto
    //importProvidersFrom(NgxSpinViewerModule, NgxPanoViewerModule),
  ],
};
