import { Routes } from "@angular/router";
import { LoginComponent } from "./login/login.component";
import { HomeComponent } from "./home/home.component";
import { authGuard } from "./guards/auth.guard";
import { WebpComponent } from "./pages/webp/webp.component";
import { FormatComponent } from "./pages/format/format.component";
import { GenerateImageComponent } from "./pages/generate-image/generate-image.component";
import { GenerateOutPaintingComponent } from "./pages/generate-out-painting/generate-out-painting.component";
import { GenerateAdsComponent } from "./pages/generate-ads/generate-ads.component";

export const routes: Routes = [
  { path: "home", component: HomeComponent, canActivate: [authGuard] },
  { path: "webp", component: WebpComponent, canActivate: [authGuard] },
  {
    path: "ads",
    component: GenerateAdsComponent,
    canActivate: [authGuard],
  },
  {
    path: "format",
    component: GenerateOutPaintingComponent,
    canActivate: [authGuard],
  },
  {
    path: "generateImages",
    component: GenerateImageComponent,
    canActivate: [authGuard],
  },
  { path: "", redirectTo: "home", pathMatch: "full" },

  { path: "login", component: LoginComponent },
  { path: "**", redirectTo: "" }, //redirecciona a login
];
