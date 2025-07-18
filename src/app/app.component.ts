import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterModule } from "@angular/router";

interface Link {
  path: string;
  label: string;
}

@Component({
  selector: "app-root",
  standalone: true, // indica que es standalone
  imports: [
    CommonModule, // para ngIf, ngFor, etc.
    RouterModule, // necesario para <router-outlet>
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent {
  links: Link[] = [
    { path: "/home", label: "INICIO" },
    { path: "/webp", label: "WEBP" },
    { path: "/generateImages", label: "IMAGEN" },
    { path: "/chat", label: "CHAT" },
    { path: "/ads", label: "ADS" },
    { path: "/format", label: "FORMATOS" },
  ];
}
