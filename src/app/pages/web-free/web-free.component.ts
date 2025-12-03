import {
  Component,
  ElementRef,
  ViewChild,
  HostListener,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";

import { OpenAIService } from "../../services/openAI/open-ai.service";
import { lastValueFrom } from "rxjs";
import { DialogService } from "../../shared/dialog.service";
import { HttpErrorResponse } from "@angular/common/http";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { FormsModule } from "@angular/forms";

type HandleId = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | "none";
type DragMode = "none" | "move" | "resize" | "pan";

interface Viewport {
  scale: number;
  ox: number;
  oy: number;
}
interface LayerTransform {
  x: number;
  y: number;
  sx: number;
  sy: number;
  w: number;
  h: number;
}

type ImgItem = {
  name: string;
  url: string;
  file: File;
  state?: LayerTransform; // transform persistente por imagen
  processedUrl?: string; // preview procesada
  processedBlob?: Blob;
  bmp?: ImageBitmap;
};

@Component({
  selector: "app-web-free",
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    FormsModule,
    MatButtonToggleModule,
  ],
  templateUrl: "./web-free.component.html",
  styleUrl: "./web-free.component.css",
})
export class WebFreeComponent {
  @ViewChild("fileInput", { static: true })
  fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild("canvasL", { static: true })
  canvasLRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasR", { static: true })
  canvasRRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasCrop", { static: false })
  canvasCropRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("tiffInput", { static: false })
  tiffInputRef!: ElementRef<HTMLInputElement>;

  private api = inject(OpenAIService);
  private dialogs = inject(DialogService);

  previewScale = 0.6; // escala visual de los canvases del panel derecho
  cropW = 1;
  cropH = 1;

  // Mundo/lienzo
  canvasW = 1080;
  canvasH = 1080;

  // Paquete de imágenes
  images: ImgItem[] = [];
  idx = 0; // navegación 1 a 1

  // Contextos
  private ctxL!: CanvasRenderingContext2D | null;
  private ctxR!: CanvasRenderingContext2D | null;

  // Viewport (solo para la izquierda)
  vp: Viewport = { scale: 0.8, ox: 0, oy: 0 };

  // Capa activa (apunta al state de la imagen actual)
  layer: LayerTransform | null = null;

  // Interacción
  private mode: DragMode = "none";
  private activeHandle: HandleId = "none";
  private startWX = 0; // world point al iniciar drag
  private startWY = 0;
  private startLayer!: LayerTransform;
  private spaceDown = false;

  canDownload = false;
  private rafPending = false;

  outputType: "image/webp" | "image/png" = "image/webp";
  quality: number = 0.8; // calidad para WEBP (0–1).// --- Métricas de peso (bytes) ---
  originalBytes = 0;
  outputBytes = 0;

  isBusy = false;
  itemsImages: [] = [];

  private templateNorm?: { x: number; y: number; W: number; H: number };

  ngAfterViewInit() {
    this.ctxL = this.canvasLRef.nativeElement.getContext("2d");
    this.ctxR = this.canvasRRef.nativeElement.getContext("2d");
    this.redrawBoth();
  }

  // === TIFF helpers ===
  openTiffPicker(): void {
    if (!this.tiffInputRef) return;
    // limpiamos el valor para que al escoger el mismo archivo se dispare igual
    this.tiffInputRef.nativeElement.value = "";
    this.tiffInputRef.nativeElement.click();
  }

  async onTiffSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;

    const files = Array.from(input.files);
    input.value = ""; // limpiar
    const items = await this.convertTiffFiles(files);
  }

  private async convertTiffFiles(files: File[]): Promise<void> {
    if (!files.length) return;

    // Si tienes una bandera global de carga, úsala
    if (typeof this.isBusy !== "undefined") {
      this.isBusy = true;
    }

    const startIndex = this.images.length;

    try {
      // 1) llamar al back a través del servicio
      const items = await this.api.convertTiffToPng(files);

      // 2) por cada PNG devuelto, convertir a Blob/URL y añadir a `this.images`
      for (const item of items) {
        const blob = this.dataUrlToBlob(item.data_url);
        const safeName =
          item.name?.replace(/\.[^.]+$/, "") + ".png" || "tiff_converted.png";

        const file = new File([blob], safeName, { type: blob.type });
        const url = URL.createObjectURL(blob);

        this.images.push({
          name: safeName,
          url,
          file, // ✅ ahora cumple la interfaz ImgItem
          processedBlob: undefined,
          processedUrl: undefined,
          bmp: undefined,
          state: undefined,
        });
      }

      // 3) Si no había selección, seleccionamos la primera
      if (
        !this.layer ||
        this.idx == null ||
        this.idx < 0 ||
        this.idx >= this.images.length
      ) {
        this.idx = startIndex; // será 0 si eran las primeras imágenes
        await this.ensureStateFor(this.idx);
        this.attachLayerFromIndex(this.idx);
        this.redrawBoth();
      }
    } catch (err) {
      console.error("Error convirtiendo TIFF:", err);
      console.error("Error convirtiendo TIFF:", err);

      let userMessage =
        "El archivo es demasiado grande. Intenta con uno de menor tamaño.";

      // HttpErrorResponse de Angular
      const httpErr = err as HttpErrorResponse;
      const body = httpErr?.error;

      // 1) Si el back envió JSON con user_message (nuestro handler/app_error)
      if (
        body &&
        typeof body === "object" &&
        typeof body.user_message === "string"
      ) {
        userMessage =
          "El archivo es demasiado grande. Intenta con uno de menor tamaño.";
      } else if (httpErr.status === 413) {
        // 2) Fallback explícito por si llega otro 413 sin JSON
        userMessage =
          "El archivo es demasiado grande. Intenta con uno de menor tamaño.";
      }

      // Mostrar el diálogo de error
      this.dialogs.showError(userMessage);
    } finally {
      if (typeof this.isBusy !== "undefined") {
        this.isBusy = false;
      }
    }
  }

  /** Helper rápido para pasar dataURL -> Blob */
  private dataUrlToBlob(dataUrl: string): Blob {
    const [meta, b64] = dataUrl.split(",");
    const mimeMatch = /data:(.*?);base64/.exec(meta || "");
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const binary = atob(b64 || "");
    const len = binary.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = binary.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  // Cambiar formato al hacer clic en los botones del toolbar
  setOutputType(fmt: "image/webp" | "image/png") {
    this.outputType = fmt;
  }

  /** Formatea bytes a B / KB / MB con 1–2 decimales */
  private formatBytes(b: number): string {
    if (!b || b <= 0) return "0 B";
    const KB = 1024;
    const MB = 1024 * 1024;

    if (b >= MB) return (b / MB).toFixed(2) + " MB";
    if (b >= KB) return (b / KB).toFixed(1) + " KB";
    return b + " B";
  }

  get weightInfo(): string | null {
    if (!this.originalBytes || !this.outputBytes) return null;

    const before = this.formatBytes(this.originalBytes);
    const after = this.formatBytes(this.outputBytes);

    const diff =
      ((this.outputBytes - this.originalBytes) / this.originalBytes) * 100;
    const sign = diff <= 0 ? "−" : "+"; // usa el guion largo para verse bonito
    const pct = Math.abs(diff).toFixed(1);

    return `Peso: ${before} → ${after} (${sign}${pct}%)`;
  }

  private scheduleLeftRedraw() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.redrawLeftCore();
    });
  }

  private async urlToBitmap(url: string): Promise<ImageBitmap> {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob);
  }

  private redrawLeft() {
    this.redrawLeftCore();
  }

  private redrawLeftCore() {
    if (!this.ctxL) return;
    const c = this.canvasLRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(rect.width * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = this.ctxL;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(
      this.vp.scale * dpr,
      0,
      0,
      this.vp.scale * dpr,
      this.vp.ox * dpr,
      this.vp.oy * dpr
    );

    this.drawChecker(ctx, this.canvasW, this.canvasH);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1 / this.vp.scale;
    ctx.strokeRect(0, 0, this.canvasW, this.canvasH);

    if (this.images.length && this.layer) {
      const it = this.images[this.idx];
      const bmp = it?.bmp;
      if (bmp) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          bmp,
          this.layer.x,
          this.layer.y,
          this.layer.w * this.layer.sx,
          this.layer.h * this.layer.sy
        );
        this.drawHandles(ctx);
      }
    }
  }

  // ✅ helper centralizado para extraer el mensaje de un HttpErrorResponse con Blob
  private async extractUserMessage(err: any): Promise<string> {
    const fallback = "No pudimos procesar la imagen. Inténtalo nuevamente.";

    try {
      // --- 1) ¿Angular devolvió JSON directo? (no-blob) ---
      const body = err?.error;
      if (body && typeof body === "object" && !(body instanceof Blob)) {
        if (typeof body.user_message === "string") return body.user_message;
        if (body.code === "CLAID_UNPROCESSABLE") {
          return "Error al editar la imagen, verifica el margen de edición intenta de nuevo";
        }
        if (typeof body.error === "string") return body.error;
      }

      // --- 2) ¿Angular devolvió un Blob (porque pediste responseType:'blob')? ---
      const blob: Blob | undefined =
        err?.error instanceof Blob ? err.error : undefined;
      if (blob) {
        // Si el servidor mandó JSON de error, el blob tendrá type application/json
        const ct = blob.type || "";
        if (ct.includes("application/json") || blob.size < 4096) {
          const text = await blob.text();
          try {
            const data = JSON.parse(text || "{}");
            if (typeof data.user_message === "string") return data.user_message;
            if (data.code === "CLAID_UNPROCESSABLE") {
              return "Error al editar la imagen, verifica el margen de edición intenta de nuevo";
            }
            if (typeof data.error === "string") return data.error;
          } catch {
            // no era JSON válido, seguimos
          }
        }
      }

      // --- 3) ¿Vino por status o message? ---
      const status = Number(err?.status);
      if (status === 422) {
        return "Error al editar la imagen, verifica el margen de edición intenta de nuevo";
      }
      const msg = String(err?.message || "");
      if (msg.includes("422")) {
        return "Error al editar la imagen, verifica el margen de edición intenta de nuevo";
      }
    } catch (e) {
      console.warn("extractUserMessage parse error:", e);
    }

    return fallback;
  }

  getOutpaintMargins(): { L: number; D: number; S: number; I: number } {
    if (!this.layer) return { L: 0, D: 0, S: 0, I: 0 };

    const { x, y, w, h, sx, sy } = this.layer;
    const { canvasW, canvasH } = this;

    const realW = w * sx;
    const realH = h * sy;

    const L = Math.max(0, x);
    const D = Math.max(0, canvasW - (x + realW));
    const S = Math.max(0, y);
    const I = Math.max(0, canvasH - (y + realH));

    console.log("imgXYWH:", x, y, realW, realH);
    console.log("canvasWH:", canvasW, canvasH);
    console.log("L, D, S, I:", L, D, S, I);

    return { L, D, S, I };
  }

  needsOutpainting(): boolean {
    console.log("needsOutpainting...");

    const { L, D, S, I } = this.getOutpaintMargins();
    return L > 0 || D > 0 || S > 0 || I > 0;
  }

  getClaidOutpaintParams(): {
    outpaint_by: string;
    recortar: { L: boolean; D: boolean; S: boolean; I: boolean };
  } {
    console.log("get Claid Output needsOutpainting...");
    const { L, D, S, I } = this.getOutpaintMargins();

    // Claid requiere simetría: tomamos el mayor valor por eje
    const hMargin = Math.ceil(Math.max(L, D));
    const vMargin = Math.ceil(Math.max(S, I));

    return {
      outpaint_by: `${hMargin}px ${vMargin}px`,
      recortar: {
        L: L < D, // si D es el importante, se recorta L
        D: D < L, // si L es el importante, se recorta D
        S: S < I,
        I: I < S,
      },
    };
  }

  private getOpaqueBounds(cnv: HTMLCanvasElement) {
    const w = cnv.width,
      h = cnv.height;
    const ctx = cnv.getContext("2d")!;
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) return { x: 0, y: 0, w: 0, h: 0, empty: true };

    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      empty: false,
    };
  }

  private canvasToBlob(cnv: HTMLCanvasElement): Promise<Blob> {
    const mime = this.outputType; // "image/webp" o "image/png"
    const q =
      mime === "image/webp"
        ? this.quality // aplica calidad 0–1 para WEBP
        : 1.0; // PNG ignora calidad, pero dejamos 1.0

    return new Promise((res) => cnv.toBlob((b) => res(b!), mime, q));
  }

  private async blobToBitmap(blob: Blob): Promise<ImageBitmap> {
    return await createImageBitmap(blob);
  }

  private nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  private markProcessedReady() {
    this.canDownload = true;
  }

  swapPresetInputs(pw: HTMLInputElement, ph: HTMLInputElement) {
    const tmp = pw.value;
    pw.value = ph.value;
    ph.value = tmp;
  }

  applyCustomPreset(pw: HTMLInputElement, ph: HTMLInputElement) {
    const w = Number(pw.valueAsNumber || parseInt(pw.value, 10));
    const h = Number(ph.valueAsNumber || parseInt(ph.value, 10));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      this.setCanvasPreset(w, h);
    }
  }

  /* ========= Carga ========= */
  onPickFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    this.disposeUrls();

    this.images = files
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      )
      .map((file) => ({
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      }));

    this.idx = 0;
    this.ensureStateFor(this.idx).then(() =>
      this.attachLayerFromIndex(this.idx)
    );
    this.canDownload = false;
    input.value = "";
  }

  private async ensureStateFor(index: number) {
    const it = this.images[index];
    if (!it) return;

    // cachea el bitmap una sola vez
    if (!it.bmp) {
      it.bmp = await this.urlToBitmap(it.url);
    }
    if (it.state) return;

    const imgW = it.bmp.width;
    const imgH = it.bmp.height;

    if (this.templateNorm) {
      const destX = this.templateNorm.x * this.canvasW;
      const destY = this.templateNorm.y * this.canvasH;
      const destW = this.templateNorm.W * this.canvasW;
      const destH = this.templateNorm.H * this.canvasH;

      it.state = {
        x: destX,
        y: destY,
        sx: destW / imgW,
        sy: destH / imgH,
        w: imgW,
        h: imgH,
      };
    } else {
      const maxSide = Math.max(imgW, imgH);
      const target = 1.0 * Math.max(this.canvasW, this.canvasH);
      const s = Math.min(target / maxSide, 1);

      it.state = {
        x: (this.canvasW - imgW * s) / 2,
        y: (this.canvasH - imgH * s) / 2,
        sx: s,
        sy: s,
        w: imgW,
        h: imgH,
      };
    }
  }

  private attachLayerFromIndex(index: number) {
    const it = this.images[index];
    this.layer = it?.state ?? null;

    // Tamaño del archivo original (si existe)
    this.originalBytes = it?.file?.size ?? 0;

    // Si ya fue procesada, mostramos también su peso de salida
    this.outputBytes = it?.processedBlob ? it.processedBlob.size : 0;

    this.redrawBoth();
  }

  /* ========= Navegación ========= */
  prev() {
    if (this.idx > 0) {
      this.idx--;
      this.ensureStateFor(this.idx).then(() =>
        this.attachLayerFromIndex(this.idx)
      );
    }
    this.canDownload = false;
  }
  next() {
    if (this.idx < this.images.length - 1) {
      this.idx++;
      this.ensureStateFor(this.idx).then(() =>
        this.attachLayerFromIndex(this.idx)
      );
    }
    this.canDownload = false;
  }

  /* ========= Render ========= */
  private redrawBoth() {
    this.scheduleLeftRedraw();
    this.redrawRight();
  }

  private redrawRight() {
    if (!this.ctxR) return;
    const c = this.canvasRRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(rect.width * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));

    const ctx = this.ctxR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // preview sin zoom (encajado al contenedor, no interactivo)
    const scale = Math.min(
      rect.width / this.canvasW,
      rect.height / this.canvasH
    );
    const ox = (rect.width - this.canvasW * scale) / 2;
    const oy = (rect.height - this.canvasH * scale) / 2;

    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
    this.drawChecker(ctx, this.canvasW, this.canvasH);
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(0, 0, this.canvasW, this.canvasH);

    // Si hay procesado, dibujarlo; si no, placeholder (nada)
    const it = this.images[this.idx];
    if (it?.processedUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, this.canvasW, this.canvasH);
      img.src = it.processedUrl;
    }
  }

  private drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const sz = 32;
    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ececec";
    for (let y = 0; y < h; y += sz)
      for (let x = 0; x < w; x += sz)
        if (((x + y) / sz) % 2 < 1) ctx.fillRect(x, y, sz, sz);
  }

  private drawHandles(ctx: CanvasRenderingContext2D) {
    if (!this.layer) return;
    const { x, y, sx, sy, w, h } = this.layer;
    const bx = x,
      by = y,
      bw = w * sx,
      bh = h * sy;

    ctx.strokeStyle = "#42a5f5";
    ctx.lineWidth = 2 / this.vp.scale;
    ctx.strokeRect(bx, by, bw, bh);

    const r = 7 / this.vp.scale;
    const pts = this.getHandlePoints(bx, by, bw, bh);
    ctx.fillStyle = "#42a5f5";
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 / this.vp.scale;
      ctx.stroke();
    });
  }
  private getHandlePoints(bx: number, by: number, bw: number, bh: number) {
    const cx = bx + bw / 2,
      cy = by + bh / 2;
    return [
      { id: "nw", x: bx, y: by },
      { id: "n", x: cx, y: by },
      { id: "ne", x: bx + bw, y: by },
      { id: "e", x: bx + bw, y: cy },
      { id: "se", x: bx + bw, y: by + bh },
      { id: "s", x: cx, y: by + bh },
      { id: "sw", x: bx, y: by + bh },
      { id: "w", x: bx, y: cy },
    ] as { id: HandleId; x: number; y: number }[];
  }

  /* ========= HUD ========= */
  get hud() {
    if (!this.layer) return { x: 0, y: 0, w: 0, h: 0, s: 1 };
    const w = Math.round(this.layer.w * this.layer.sx);
    const h = Math.round(this.layer.h * this.layer.sy);
    return {
      x: Math.round(this.layer.x),
      y: Math.round(this.layer.y),
      w,
      h,
      s: +this.layer.sx.toFixed(3),
    };
  }

  async processCurrent() {
    if (!this.images.length || !this.layer) return;

    const it = this.images[this.idx];
    const outW = this.canvasW;
    const outH = this.canvasH;

    this.originalBytes = it.file?.size ?? 0;

    // 1) Componer SIEMPRE el preprocesado 1:1 del lienzo
    const base = await this.loadImage(it.url);
    const off = document.createElement("canvas");
    off.width = outW;
    off.height = outH;
    const octx = off.getContext("2d")!;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, outW, outH);
    octx.drawImage(
      base,
      this.layer.x,
      this.layer.y,
      this.layer.w * this.layer.sx,
      this.layer.h * this.layer.sy
    );

    // 2) Mostrar el PREPROCESADO en el card superior (Imagen Modificada)
    {
      const cR = this.canvasRRef.nativeElement;
      cR.width = outW;
      cR.height = outH;
      const rctx = cR.getContext("2d")!;
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, outW, outH);
      rctx.drawImage(off, 0, 0);
    }

    const preBlob = await this.canvasToBlob(off);

    // 3) Si NO necesita outpainting, guardamos y salimos
    if (!this.needsOutpainting()) {
      if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
      it.processedBlob = preBlob;
      it.processedUrl = URL.createObjectURL(preBlob);

      this.outputBytes = preBlob.size;

      // limpiar card del crop
      if (this.canvasCropRef) {
        const cC = this.canvasCropRef.nativeElement;
        cC.width = 1;
        cC.height = 1;
        const cctx = cC.getContext("2d")!;
        cctx.clearRect(0, 0, 1, 1);
        this.cropW = 1;
        this.cropH = 1;
        await this.nextFrame(); // asegura que el marco se reajuste
      }

      this.markProcessedReady();
      return;
    }

    // 4) Encontrar región opaca (sin transparente) para ENVIAR a Claid
    const bounds = this.getOpaqueBounds(off);
    if (bounds.empty) {
      // no hay nada opaco: devolvemos el preprocesado
      if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
      it.processedBlob = preBlob;
      it.processedUrl = URL.createObjectURL(preBlob);
      this.markProcessedReady();
      return;
    }

    // preparar el canvas del crop
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = bounds.w;
    cropCanvas.height = bounds.h;
    cropCanvas
      .getContext("2d")!
      .drawImage(
        off,
        bounds.x,
        bounds.y,
        bounds.w,
        bounds.h,
        0,
        0,
        bounds.w,
        bounds.h
      );

    // 4.1) Mostrar el CROP en el card inferior
    //     Importante: primero actualizamos los CSS vars (cropW/cropH),
    //     esperamos un frame para que Angular los aplique,
    //     y recién luego pintamos el canvas para evitar que se vea "una rayita".
    if (this.canvasCropRef) {
      this.cropW = bounds.w;
      this.cropH = bounds.h;
      await this.nextFrame(); // deja que el DOM aplique --w/--h

      const cC = this.canvasCropRef.nativeElement;
      cC.width = bounds.w;
      cC.height = bounds.h;
      const cctx = cC.getContext("2d")!;
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.clearRect(0, 0, bounds.w, bounds.h);
      cctx.drawImage(cropCanvas, 0, 0);
    }

    const croppedBlob = await this.canvasToBlob(cropCanvas);

    // Márgenes recortados respecto al canvas original (para reconstruir posición en el back)
    const L0 = bounds.x;
    const S0 = bounds.y;
    const D0 = outW - (bounds.x + bounds.w);
    const I0 = outH - (bounds.y + bounds.h);

    const { outpaint_by, recortar } = this.claidParamsFromMargins(
      L0,
      D0,
      S0,
      I0
    );

    // 5) Enviar a CLAID la IMAGEN CROP (opaca) + metadatos
    try {
      const finalBlob = await lastValueFrom(
        this.api.sendImageForOutpainting(
          croppedBlob,
          it.name || "input.png",
          outpaint_by,
          recortar,
          outW,
          outH,
          { L0, D0, S0, I0, cropped_input: true }
        )
      );

      if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
      it.processedBlob = finalBlob;
      it.processedUrl = URL.createObjectURL(finalBlob);

      // 6) Reemplazar el card superior con el RESULTADO FINAL (1:1)
      const bmp = await this.blobToBitmap(finalBlob);
      const cR = this.canvasRRef.nativeElement;
      const rctx = cR.getContext("2d")!;
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, outW, outH);
      rctx.drawImage(bmp, 0, 0, outW, outH);

      this.markProcessedReady();
    } catch (err: any) {
      console.error("Error backkkkkk:", err.status);
      const msg = await this.extractUserMessage(err);

      // Devolvemos el preprocesado en caso de fallo
      if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
      it.processedBlob = preBlob;
      it.processedUrl = URL.createObjectURL(preBlob);
      this.markProcessedReady();
      this.dialogs.showError(msg);
    }
  }

  private claidParamsFromMargins(
    L0: number,
    D0: number,
    S0: number,
    I0: number
  ) {
    // píxeles a añadir por eje: mitad de la suma (simétrico en Claid)
    const Hsum = L0 + D0;
    const Vsum = S0 + I0;
    const hpx = Hsum > 0 ? Math.ceil(Hsum / 2) : 0;
    const vpx = Vsum > 0 ? Math.ceil(Vsum / 2) : 0;

    // qué lado recortar (solo en casos de 1-lado). Si hay margen en ambos lados, no recortamos.
    const recortar: Record<"L" | "D" | "S" | "I", boolean> = {
      L: false,
      D: false,
      S: false,
      I: false,
    };

    if (hpx > 0) {
      if (L0 > 0 && D0 === 0)
        recortar.D = true; // conservar izquierda -> recorto derecha
      else if (D0 > 0 && L0 === 0) recortar.L = true; // conservar derecha -> recorto izquierda
    }
    if (vpx > 0) {
      if (S0 > 0 && I0 === 0)
        recortar.I = true; // conservar arriba -> recorto abajo
      else if (I0 > 0 && S0 === 0) recortar.S = true; // conservar abajo -> recorto arriba
    }

    const outpaint_by = `${hpx}px ${vpx}px`;
    return { outpaint_by, recortar, hpx, vpx };
  }

  downloadEdited() {
    const canvas = this.canvasRRef?.nativeElement;
    if (!canvas) return;

    const base =
      (this.images?.[this.idx]?.name || "imagen").replace(/\.[^.]+$/, "") ||
      "imagen";

    const ext = this.outputType === "image/webp" ? "webp" : "png";
    const mime = this.outputType;
    const q = mime === "image/webp" ? this.quality : 1.0;

    const filename = `${base}_edit_${this.canvasW}x${this.canvasH}.${ext}`;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      mime,
      q
    );
  }

  /* ========= Controles de vista / presets ========= */
  setCanvasPreset(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;

    // Forzar resolución del canvas de salida al preset (no la del stage)
    const cR = this.canvasRRef.nativeElement;
    cR.width = w;
    cR.height = h;

    // (opcional) si usas DPR en el canvas izquierdo, aquí NO lo apliques al derecho
    this.canDownload = false;
    if (this.templateNorm && this.images.length) {
      const it = this.images[this.idx];
      if (it?.state && it?.bmp) {
        const imgW = it.bmp.width,
          imgH = it.bmp.height;
        const destX = this.templateNorm.x * this.canvasW;
        const destY = this.templateNorm.y * this.canvasH;
        const destW = this.templateNorm.W * this.canvasW;
        const destH = this.templateNorm.H * this.canvasH;
        it.state.x = destX;
        it.state.y = destY;
        it.state.sx = destW / imgW;
        it.state.sy = destH / imgH;
        this.layer = it.state;
        this.redrawLeft(); // o this.scheduleLeftRedraw();
      }
    }
  }
  zoomFit() {
    const c = this.canvasLRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const s = Math.min(rect.width / this.canvasW, rect.height / this.canvasH);
    this.vp.scale = Math.max(0.1, Math.min(8, s));
    this.vp.ox = (rect.width - this.canvasW * this.vp.scale) / 2;
    this.vp.oy = (rect.height - this.canvasH * this.vp.scale) / 2;
    this.scheduleLeftRedraw();
  }
  zoomReset() {
    this.vp.scale = 0.8;
    this.vp.ox = 0;
    this.vp.oy = 0;
    this.scheduleLeftRedraw();
  }

  /* ========= Mouse/Keyboard (solo izquierda) ========= */
  @HostListener("window:keydown", ["$event"])
  onKey(ev: KeyboardEvent) {
    if (ev.code === "Space") this.spaceDown = true;
  }
  @HostListener("window:keyup", ["$event"])
  onKeyUp(ev: KeyboardEvent) {
    if (ev.code === "Space") this.spaceDown = false;
  }

  onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const { x, y } = this.screenToWorld(ev.offsetX, ev.offsetY);
    const s0 = this.vp.scale;
    const k = Math.exp(-ev.deltaY * 0.0015);
    const s1 = Math.min(8, Math.max(0.1, s0 * k));

    const c = this.canvasLRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;

    this.vp.ox = sx - x * s1;
    this.vp.oy = sy - y * s1;
    this.vp.scale = s1;
    this.scheduleLeftRedraw();
  }

  onPointerDown(ev: PointerEvent) {
    if (!this.layer) return;
    // Si es scroll/clic medio, no hacemos nada
    if (ev.button === 1) return;
    const c = this.canvasLRef.nativeElement;
    c.setPointerCapture(ev.pointerId);

    const wpt = this.screenToWorld(ev.offsetX, ev.offsetY);
    const handle = this.hitTestHandle(wpt.x, wpt.y);

    if (this.spaceDown) {
      this.mode = "pan";
    } else if (handle !== "none") {
      this.mode = "resize";
      this.activeHandle = handle;
    } else if (this.pointInLayer(wpt.x, wpt.y)) {
      this.mode = "move";
      this.activeHandle = "none";
    } else {
      this.mode = "none";
    }

    this.startWX = wpt.x;
    this.startWY = wpt.y;
    this.startLayer = { ...this.layer };
  }

  onPointerMove(ev: PointerEvent) {
    if (!this.layer) return;
    const wpt = this.screenToWorld(ev.offsetX, ev.offsetY);
    const dx = wpt.x - this.startWX;
    const dy = wpt.y - this.startWY;

    if (this.mode === "pan") {
      this.vp.ox += ev.movementX;
      this.vp.oy += ev.movementY;
      this.scheduleLeftRedraw();
      return;
    }
    if (this.mode === "move") {
      this.layer.x = this.startLayer.x + dx;
      this.layer.y = this.startLayer.y + dy;
      this.scheduleLeftRedraw();
      return;
    }
    if (this.mode === "resize") {
      const L = this.layer;
      const minSize = 32;
      const baseW = this.startLayer.w * this.startLayer.sx;
      const baseH = this.startLayer.h * this.startLayer.sy;

      const fromRight = this.activeHandle.includes("e");
      const fromLeft = this.activeHandle.includes("w");
      const fromBottom = this.activeHandle.includes("s");
      const fromTop = this.activeHandle.includes("n");
      const corner = (fromLeft || fromRight) && (fromTop || fromBottom);

      if (corner) {
        // proporcional
        const signX = fromRight ? 1 : -1;
        const signY = fromBottom ? 1 : -1;
        const dpx = signX * dx;
        const dpy = signY * dy;
        const d = Math.abs(baseW) > Math.abs(baseH) ? dpx : dpy;
        const ratio = (baseW + d) / baseW;
        const s = Math.max(
          minSize / Math.max(this.startLayer.w, this.startLayer.h),
          this.startLayer.sx * ratio
        );
        const k = s / this.startLayer.sx;
        const newW = baseW * k;
        const newH = baseH * k;
        const anchor = this.getAnchorFromHandle(
          this.activeHandle,
          this.startLayer
        );
        L.sx = s;
        L.sy = s;
        if (fromLeft) L.x = anchor.ax - newW;
        else if (fromRight) L.x = anchor.ax;
        if (fromTop) L.y = anchor.ay - newH;
        else if (fromBottom) L.y = anchor.ay;
      } else {
        // no proporcional
        let newW = baseW,
          newH = baseH,
          newX = this.startLayer.x,
          newY = this.startLayer.y;
        if (fromLeft) {
          newW = baseW - dx;
          newX = this.startLayer.x + dx;
        }
        if (fromRight) {
          newW = baseW + dx;
        }
        if (fromTop) {
          newH = baseH - dy;
          newY = this.startLayer.y + dy;
        }
        if (fromBottom) {
          newH = baseH + dy;
        }
        newW = Math.max(minSize, newW);
        newH = Math.max(minSize, newH);
        L.sx = newW / L.w;
        L.sy = newH / L.h;
        L.x = newX;
        L.y = newY;
      }
      this.scheduleLeftRedraw();
    }
  }

  onPointerUp(ev: PointerEvent) {
    try {
      this.canvasLRef.nativeElement.releasePointerCapture(ev.pointerId);
    } catch {}
    this.mode = "none";
    this.activeHandle = "none";
    if (this.layer) {
      const W = (this.layer.w * this.layer.sx) / this.canvasW;
      const H = (this.layer.h * this.layer.sy) / this.canvasH;
      const x = this.layer.x / this.canvasW;
      const y = this.layer.y / this.canvasH;
      this.templateNorm = { x, y, W, H };
    }
  }

  /* ========= Utilidades ========= */
  private screenToWorld(sx: number, sy: number) {
    const dpr = window.devicePixelRatio || 1;
    const x = (sx * dpr - this.vp.ox * dpr) / (this.vp.scale * dpr);
    const y = (sy * dpr - this.vp.oy * dpr) / (this.vp.scale * dpr);
    return { x, y };
  }
  private pointInLayer(wx: number, wy: number) {
    if (!this.layer) return false;
    const { x, y, sx, sy, w, h } = this.layer;
    return wx >= x && wx <= x + w * sx && wy >= y && wy <= y + h * sy;
  }
  private hitTestHandle(wx: number, wy: number): HandleId {
    if (!this.layer) return "none";
    const { x, y, sx, sy, w, h } = this.layer;
    const bx = x,
      by = y,
      bw = w * sx,
      bh = h * sy;
    const pts = this.getHandlePoints(bx, by, bw, bh);
    const r = 12 / this.vp.scale;
    for (const p of pts) {
      const dx = wx - p.x,
        dy = wy - p.y;
      if (dx * dx + dy * dy <= r * r) return p.id;
    }
    return "none";
  }
  private getAnchorFromHandle(handle: HandleId, snap: LayerTransform) {
    const bx = snap.x,
      by = snap.y,
      bw = snap.w * snap.sx,
      bh = snap.h * snap.sy;
    const map: Record<HandleId, { ax: number; ay: number }> = {
      nw: { ax: bx + bw, ay: by + bh },
      n: { ax: bx, ay: by + bh },
      ne: { ax: bx, ay: by + bh },
      e: { ax: bx, ay: by },
      se: { ax: bx, ay: by },
      s: { ax: bx, ay: by },
      sw: { ax: bx + bw, ay: by },
      w: { ax: bx + bw, ay: by },
      none: { ax: bx, ay: by },
    };
    return map[handle];
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = url;
    });
  }
  private disposeUrls() {
    this.images.forEach((i) => {
      URL.revokeObjectURL(i.url);
      if (i.processedUrl) URL.revokeObjectURL(i.processedUrl);
      if (i.bmp) {
        try {
          i.bmp.close();
        } catch {}
      }
    });
  }

  onAuxClick(ev: MouseEvent) {
    if (ev.button === 1) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  ngOnDestroy() {
    this.disposeUrls();
  }
}
