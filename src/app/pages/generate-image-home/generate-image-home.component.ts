import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCard, MatCardActions, MatCardHeader } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { Router } from "@angular/router";

@Component({
  selector: "app-generate-image-home",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatCard,
    MatCardHeader,
    MatCardActions,
  ],
  templateUrl: "./generate-image-home.component.html",
  styleUrl: "./generate-image-home.component.css",
})
export class GenerateImageHomeComponent {
  private router = inject(Router);
  // Banner inicial
  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;

  goToText() {
    this.router.navigate(["/generateImages/textToImage"]);
  }
  goToImage() {
    this.router.navigate(["/generateImages/imageToImage"]);
  }
  goToImageReferencia() {
    this.router.navigate(["/generateImages/imageToReferencia"]);
  }
}
