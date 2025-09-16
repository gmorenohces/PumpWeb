import { CommonModule } from "@angular/common";
import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCard, MatCardActions, MatCardHeader } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { Router } from "@angular/router";


@Component({
  selector: "app-webhome",
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
  templateUrl: "./webhome.component.html",
  styleUrl: "./webhome.component.css",
})
export class WebhomeComponent {
  private router = inject(Router);
  // Banner inicial
  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;

  goTo360() {
    this.router.navigate(["/webp360"]);
  }
  goToFree() {
    this.router.navigate(["/webpfree"]);
  }
}
