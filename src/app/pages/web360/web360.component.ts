import {
  Component,
  signal,
  inject,
  HostListener,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import {
  FormBuilder,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from "@angular/forms";

import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelectModule } from "@angular/material/select";
import { MatSliderModule } from "@angular/material/slider";
import { MatDividerModule } from "@angular/material/divider";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCheckboxModule } from "@angular/material/checkbox";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type Frame = {
  name: string;
  file: File | null;
  url: string;
  blob?: Blob;
  width?: number;
  height?: number;
  size?: number;
  sizeHuman?: string;
  savePct?: number; // contra original
};

type Params = {
  trimX: number; // nuevo: L/R
  trimY: number;
  targetW: number | null;
  targetH: number | null;
  lockAspect: boolean;
  quality: number; // 0.1..1 (para webp/jpeg)
  format: "webp" | "jpeg" | "png";
  showChecker: boolean;
  view1to1: boolean;
};

@Component({
  selector: "app-web360",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCheckboxModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSelectModule,
    MatSliderModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatExpansionModule,
    MatSnackBarModule,
    MatButtonToggleModule,
  ],
  templateUrl: "./web360.component.html",
  styleUrl: "./web360.component.css",
})
export class Web360Component {
  // Banner inicial
  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;
  @ViewChild("fileInput", { static: true })
  fileInput!: ElementRef<HTMLInputElement>;

  originalFrames: Frame[] = [];
  processedFrames: Frame[] = [];

  currentIndex = 0;
  viewerIndex = 0;

  params: Params = {
    trimX: 200,
    trimY: 200,
    targetW: null,
    targetH: null,
    lockAspect: true,
    quality: 0.8,
    format: "webp",
    showChecker: true, // por defecto ACTIVADO (puedes poner false)
    view1to1: false,
  };

  // Drag state for 360 viewer
  private dragging = false;
  private lastX = 0;
  private dragTarget: "original" | "processed" | null = null;

  // =========== File & UI ===========

  async onFilesSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const files = Array.from(input.files).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    this.originalFrames = [];
    this.processedFrames = [];
    this.currentIndex = 0;
    this.viewerIndex = 0;

    for (const f of files) {
      const url = URL.createObjectURL(f);
      const meta = await this.readImageMeta(url);
      this.originalFrames.push({
        name: f.name,
        file: f,
        url,
        width: meta.width,
        height: meta.height,
        size: f.size,
        sizeHuman: this.humanSize(f.size),
      });
    }
  }

  setInitialIndex(i: number) {
    this.currentIndex = Math.max(
      0,
      Math.min(i, this.originalFrames.length - 1)
    );
    console.log(this.currentIndex);

    this.viewerIndex = this.currentIndex;
  }

  resetAll() {
    // revoke urls
    this.originalFrames.forEach((f) => URL.revokeObjectURL(f.url));
    this.processedFrames.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    this.originalFrames = [];
    this.processedFrames = [];
    this.currentIndex = 0;
    this.viewerIndex = 0;
    this.params = {
      trimX: 200,
      trimY: 200,
      targetW: null,
      targetH: null,
      lockAspect: true,
      quality: 0.8,
      format: "webp",
      showChecker: true, // por defecto ACTIVADO (puedes poner false)
      view1to1: false,
    };
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = "";
  }

  revertProcessed() {
    // liberar blobs
    this.processedFrames.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    this.processedFrames = [];
  }

  // =========== Processing ===========

  async applyToAll() {
    if (!this.originalFrames.length) return;

    // limpiar previos
    this.revertProcessed();

    const out: Frame[] = [];
    for (let i = 0; i < this.originalFrames.length; i++) {
      const src = this.originalFrames[i];
      const result = await this.processOne(src, this.params);
      out.push(result);
      if (i === this.currentIndex) {
        // mantener preview sincronizada
        this.viewerIndex = i;
      }
    }
    this.processedFrames = out;
  }

  private async processOne(src: Frame, p: Params): Promise<Frame> {
    const img = await this.loadImage(src.url);

    // 1) Recorte simétrico por lados (L/R) y por arriba/abajo (T/B)
    const trimX = Math.max(0, Math.floor(p.trimX || 0));
    const trimY = Math.max(0, Math.floor(p.trimY || 0));

    const cropX = Math.min(trimX, img.width - 1);
    const cropY = Math.min(trimY, img.height - 1);
    const cropW = Math.max(1, img.width - 2 * cropX);
    const cropH = Math.max(1, img.height - 2 * cropY);

    // 2) Resize (igual que lo tenías)
    let targetW = p.targetW ?? cropW;
    let targetH = p.targetH ?? cropH;

    if (p.lockAspect) {
      const ratio = cropW / cropH;
      if (p.targetW && !p.targetH) targetH = Math.round(targetW / ratio);
      if (!p.targetW && p.targetH) targetW = Math.round(targetH * ratio);
      if (!p.targetW && !p.targetH) {
        targetW = cropW;
        targetH = cropH;
      }
    }

    targetW = Math.max(1, Math.floor(targetW));
    targetH = Math.max(1, Math.floor(targetH));

    // 3) Canvas + export (igual que antes)
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    let mime = "image/webp";
    if (p.format === "jpeg") mime = "image/jpeg";
    if (p.format === "png") mime = "image/png";

    const blob: Blob = await new Promise((res) => {
      if (mime === "image/png") canvas.toBlob((b) => res(b!), mime);
      else canvas.toBlob((b) => res(b!), mime, this.clampQuality(p.quality));
    });

    const url = URL.createObjectURL(blob);
    const size = blob.size;
    const savePct = src.size
      ? Math.max(0, Math.round((1 - size / src.size) * 100))
      : 0;

    return {
      name: this.buildOutName(src.name, p.format),
      file: null,
      url,
      blob,
      width: targetW,
      height: targetH,
      size,
      sizeHuman: this.humanSize(size),
      savePct,
    };
  }

  // =========== 360 Viewer (drag to rotate) ===========

  startDrag(ev: MouseEvent | TouchEvent, which: "original" | "processed") {
    this.dragging = true;
    this.dragTarget = which;
    this.lastX = this.getX(ev);
    window.addEventListener("mousemove", this.onDragMove);
    window.addEventListener("touchmove", this.onDragMove as any, {
      passive: false,
    });
    window.addEventListener("mouseup", this.onDragEnd);
    window.addEventListener("touchend", this.onDragEnd as any);
  }

  private onDragMove = (ev: MouseEvent | TouchEvent) => {
    if (!this.dragging) return;
    const x = this.getX(ev);
    const dx = x - this.lastX;
    // Cambia frame cada ~12 px (ajusta al gusto)
    const step = Math.trunc(dx / 12);
    if (step !== 0) {
      this.rotate(step);
      this.lastX = x;
    }
    if (ev instanceof TouchEvent) ev.preventDefault();
  };

  private onDragEnd = () => {
    this.dragging = false;
    this.dragTarget = null;
    window.removeEventListener("mousemove", this.onDragMove);
    window.removeEventListener("touchmove", this.onDragMove as any);
    window.removeEventListener("mouseup", this.onDragEnd);
    window.removeEventListener("touchend", this.onDragEnd as any);
  };

  private rotate(step: number) {
    const len =
      this.dragTarget === "processed"
        ? this.processedFrames.length
        : this.originalFrames.length;
    if (!len) return;
    this.viewerIndex = (this.viewerIndex + step) % len;
    if (this.viewerIndex < 0) this.viewerIndex += len;
  }

  // =========== Download ===========

  async downloadAll() {
    if (!this.processedFrames.length) return;

    // Si tienes JSZip en tu proyecto, descomenta y usa zip.
    // En caso contrario, descarga una a una (fallback).

    // Fallback: descarga individual
    for (const f of this.processedFrames) {
      await this.triggerDownload(f.blob!, f.name);
    }
  }

  private async triggerDownload(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // =========== Helpers ===========

  private getX(ev: MouseEvent | TouchEvent): number {
    return ev instanceof MouseEvent ? ev.clientX : ev.touches[0].clientX;
  }

  private async readImageMeta(
    url: string
  ): Promise<{ width: number; height: number }> {
    const img = await this.loadImage(url);
    return { width: img.width, height: img.height };
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  private humanSize(bytes?: number): string {
    if (!bytes && bytes !== 0) return "";
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) return bytes + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let u = -1;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
  }

  private clampQuality(q?: number) {
    if (q == null) return 0.8;
    return Math.min(1, Math.max(0.1, q));
  }

  private buildOutName(name: string, fmt: Params["format"]) {
    const base = name.replace(/\.[^.]+$/, "");
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    return `${base}__opt.${ext}`;
  }

  get totalSavingsPct(): number {
    if (!this.originalFrames.length || !this.processedFrames.length) return 0;
    const orig = this.originalFrames.reduce((acc, f) => acc + (f.size || 0), 0);
    const proc = this.processedFrames.reduce(
      (acc, f) => acc + (f.size || 0),
      0
    );
    if (!orig) return 0;
    return Math.max(0, Math.round((1 - proc / orig) * 100));
  }

  // Seguridad: detener drag si mouse sale de ventana
  @HostListener("window:blur") onBlur() {
    if (this.dragging) this.onDragEnd();
  }

  private guessExtFromBlobType(type: string | undefined): string {
    if (!type) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
    if (type.includes("png")) return "png";
    return "png";
  }

  private async ensureBlob(f: Frame): Promise<Blob> {
    if (f.blob) return f.blob;
    if (f.file) return f.file; // original subido por el usuario
    // fallback para urls blob:
    const r = await fetch(f.url);
    return await r.blob();
  }

  private padIndex(i: number, total: number) {
    const width = String(total).length;
    return String(i + 1).padStart(width, "0");
  }

  private nowStamp() {
    const d = new Date();
    const z = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(
      d.getHours()
    )}${z(d.getMinutes())}${z(d.getSeconds())}`;
  }

  async downloadZip(processedPreferred = true) {
    // Si hay procesadas, usa esas; si no, usa las originales
    const frames =
      processedPreferred && this.processedFrames.length
        ? this.processedFrames
        : this.originalFrames;

    if (!frames.length) return;

    const zip = new JSZip();
    const folder = zip.folder("web360")!;

    await Promise.all(
      frames.map(async (f, i) => {
        const blob = await this.ensureBlob(f);
        const ext =
          this.guessExtFromBlobType(blob.type) ||
          f.name.split(".").pop() ||
          "png";
        // Mantén el nombre si ya lo tienes; si no, genera uno ordenado
        const niceName = f.name
          ? f.name
          : `frame_${this.padIndex(i, frames.length)}.${ext}`;

        folder.file(niceName, blob);
      })
    );

    const out = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      streamFiles: true,
    });

    const label =
      processedPreferred && this.processedFrames.length
        ? "processed"
        : "original";
    saveAs(out, `web360_${label}_${this.nowStamp()}.zip`);
  }
}
