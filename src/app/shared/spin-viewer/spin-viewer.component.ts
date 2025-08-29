// spin-viewer.component.ts

import { Component, Input, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-spin-viewer",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spin-container" #ctr>
      <img class="spin-image" [src]="images[currentIndex]" alt="360° frame" />
    </div>
  `,
  styles: [
    `
      .spin-container {
        width: 640px;
        overflow: hidden;
        position: relative;
        cursor: grab;
        user-select: none;
      }
      .spin-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
    `,
  ],
})
export class SpinViewerComponent {
  @Input() images: string[] = [];
  currentIndex = 0;

  // Mueve el índice según la posición X del ratón
  @HostListener("mousemove", ["$event"])
  onMouseMove(e: MouseEvent) {
    if (!this.images.length) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    this.currentIndex = Math.floor(ratio * (this.images.length - 1));
  }

  // Opcional: al salir, vuelve al primer frame
  @HostListener("mouseleave")
  onMouseLeave() {
    this.currentIndex = 0;
  }
}
