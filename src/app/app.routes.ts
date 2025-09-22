import { Routes } from "@angular/router";
import { LoginComponent } from "./login/login.component";
import { HomeComponent } from "./home/home.component";
import { authGuard } from "./guards/auth.guard";
import { WebpComponent } from "./pages/webp/webp.component";
import { FormatComponent } from "./pages/format/format.component";
import { GenerateImageComponent } from "./pages/generate-image/generate-image.component";
import { GenerateOutPaintingComponent } from "./pages/generate-out-painting/generate-out-painting.component";
import { GenerateAdsComponent } from "./pages/generate-ads/generate-ads.component";
import { Web360Component } from "./pages/web360/web360.component";
import { WebFreeComponent } from "./pages/web-free/web-free.component";
import { WebhomeComponent } from "./pages/webhome/webhome.component";
import { GenerateImageHomeComponent } from "./pages/generate-image-home/generate-image-home.component";
import { TextImageComponent } from "./pages/text-image/text-image.component";
import { ImageReferenciaComponent } from "./pages/image-referencia/image-referencia.component";
import { ChatAssistantComponent } from "./pages/chat-assistant/chat-assistant.component";

export const routes: Routes = [
  { path: "home", component: HomeComponent, canActivate: [authGuard] },
  { path: "webp", component: WebpComponent, canActivate: [authGuard] },
  { path: "webphome", component: WebhomeComponent },
  { path: "webp360", component: Web360Component, canActivate: [authGuard] },
  { path: "webpfree", component: WebFreeComponent, canActivate: [authGuard] },
  {
    path: "ads",
    component: GenerateAdsComponent,
    canActivate: [authGuard],
  },
  {
    path: "chat",
    component: ChatAssistantComponent,
    canActivate: [authGuard],
  },
  {
    path: "generateImages",
    component: GenerateImageHomeComponent,
    canActivate: [authGuard],
  },
  {
    path: "generateImages/textToImage",
    component: TextImageComponent,
    canActivate: [authGuard],
  },
  {
    path: "generateImages/imageToImage",
    component: GenerateImageComponent,
    canActivate: [authGuard],
  },
  {
    path: "generateImages/imageToReferencia",
    component: ImageReferenciaComponent,
    canActivate: [authGuard],
  },

  { path: "", redirectTo: "home", pathMatch: "full" },

  { path: "login", component: LoginComponent },
  { path: "**", redirectTo: "" }, //redirecciona a login
];
