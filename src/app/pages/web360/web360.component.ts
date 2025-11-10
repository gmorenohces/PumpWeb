import { Component, ElementRef, ViewChild, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";
import { FormsModule } from "@angular/forms";
import { MatButtonToggleModule } from "@angular/material/button-toggle";

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
  state?: LayerTransform;
  processedUrl?: string;
  processedBlob?: Blob;
  bmp?: ImageBitmap; // cache de imagen decodificada
};

@Component({
  selector: "app-web360",
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
  templateUrl: "./web360.component.html",
  styleUrl: "./web360.component.css",
})
export class Web360Component {
  @ViewChild("fileInput", { static: true })
  fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild("canvasL", { static: true })
  canvasLRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("canvasR", { static: true })
  canvasRRef!: ElementRef<HTMLCanvasElement>;

  // Panel derecho (preview visual)
  previewScale = 0.6;

  // === Salida ===
  outputType: "image/webp" | "image/png" = "image/webp"; // por defecto WEBP
  quality = 0.8; // 0..1

  // Lienzo
  canvasW = 1080;
  canvasH = 1080;

  // Paquete 360
  images: ImgItem[] = [];
  idx = 0;

  // Contextos
  private ctxL!: CanvasRenderingContext2D | null;
  private ctxR!: CanvasRenderingContext2D | null;
  private rafPending = false;

  // Viewport de edición (izquierda)
  vp: Viewport = { scale: 0.8, ox: 0, oy: 0 };

  // Capa activa (apunta a images[idx].state)
  layer: LayerTransform | null = null;

  // Interacción
  private mode: DragMode = "none";
  private activeHandle: HandleId = "none";
  private startWX = 0;
  private startWY = 0;
  private startLayer!: LayerTransform;
  private spaceDown = false;

  canDownload = false;

  canDownloadZip = false;

  // ========= NUEVO: Template de encuadre (normalizado a canvas) =========
  // Guardamos el rectángulo final que se ve (x,y,W,H) en coordenadas de lienzo,
  // pero lo normalizamos a [0..1] para que sirva si cambias el preset.
  private templateNorm?: { x: number; y: number; W: number; H: number };

  // ========= NUEVO: Visores 360 =========
  viewerIndexOrig = 0;
  viewerIndexProc = 0;
  private drag360 = { active: false, lastX: 0 };

  // Getters para HTML (strict templates)
  get origSrc(): string | null {
    const it = this.images[this.viewerIndexOrig];
    return it ? it.url : null;
  }
  get procSrc(): string | null {
    const it = this.images[this.viewerIndexProc];
    return it?.processedUrl ?? null;
  }
  get processedCurrentSrc(): string | null {
    return this.images[this.idx]?.processedUrl ?? null;
  }

  ngAfterViewInit() {
    this.ctxL = this.canvasLRef.nativeElement.getContext("2d");
    this.ctxR = this.canvasRRef.nativeElement.getContext("2d");
    this.redrawBoth();
  }

  // ============ Utilidades básicas ============
  private nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }
  private canvasToBlob(
    cnv: HTMLCanvasElement,
    type: "image/webp" | "image/png" = this.outputType,
    quality = this.quality
  ): Promise<Blob> {
    return new Promise((res) => cnv.toBlob((b) => res(b!), type, quality));
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
  ngOnDestroy() {
    this.disposeUrls();
  }

  // ============ Presets / vista ============
  setCanvasPreset(w: number, h: number) {
    this.canvasW = w;
    this.canvasH = h;
    const cR = this.canvasRRef.nativeElement;
    cR.width = w;
    cR.height = h;

    // re-aplicar template si existe
    if (this.templateNorm && this.images.length) {
      this.applyTemplateToIndex(this.idx);
    }
    this.canDownload = false;
    this.redrawBoth();
  }
  zoomFit() {
    const c = this.canvasLRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const s = Math.min(rect.width / this.canvasW, rect.height / this.canvasH);
    this.vp.scale = Math.max(0.1, Math.min(8, s));
    this.vp.ox = (rect.width - this.canvasW * this.vp.scale) / 2;
    this.vp.oy = (rect.height - this.canvasH * this.vp.scale) / 2;
    //this.redrawLeft();
    this.scheduleLeftRedraw();
  }
  zoomReset() {
    this.vp.scale = 0.8;
    this.vp.ox = 0;
    this.vp.oy = 0;
    //this.redrawLeft();
    this.scheduleLeftRedraw();
  }

  // ============ Carga ============
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
    this.templateNorm = undefined; // se definirá al procesar o al terminar el primer ajuste
    this.viewerIndexOrig = 0;
    this.viewerIndexProc = 0;
    input.value = "";
  }

  private async ensureStateFor(index: number) {
    const it = this.images[index];
    if (!it) return;

    // 1) cachear bitmap si falta (evita parpadeo en cada move)
    if (!it.bmp) {
      it.bmp = await this.urlToBitmap(it.url); // ← createImageBitmap(blob)
    }

    // 2) si ya tiene estado, no recalcular (pero ya tenemos bmp cacheado)
    if (it.state) return;

    // 3) dimensiones desde el bitmap (sin redecodificar la imagen)
    const imgW = it.bmp.width;
    const imgH = it.bmp.height;

    if (this.templateNorm) {
      // aplicar template normalizado al canvas actual
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
      // inicial (contain ~60–100% del lienzo, como tenías)
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
    this.layer = this.images[index]?.state ?? null;
    this.redrawBoth();
  }

  // ============ Navegación ============
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

  // ============ Render ============
  private redrawBoth() {
    //this.redrawLeft();
    this.scheduleLeftRedraw();
    this.redrawRight();
  }

  private redrawLeft() {
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
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(
          img,
          this.layer!.x,
          this.layer!.y,
          this.layer!.w * this.layer!.sx,
          this.layer!.h * this.layer!.sy
        );
        this.drawHandles(ctx);
      };
      img.src = this.images[this.idx].url;
    }
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

    // preview encajado al contenedor
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

    ctx.strokeStyle = "#1e88e5";
    ctx.lineWidth = 2 / this.vp.scale;
    ctx.setLineDash([8 / this.vp.scale, 8 / this.vp.scale]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);

    // puntos
    const r = 7 / this.vp.scale;
    const pts = this.getHandlePoints(bx, by, bw, bh);
    ctx.fillStyle = "#1e88e5";
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

  // ======== HUD (para etiqueta flotante vieja) ========
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

  // ============ Procesar (100% front) ============
  async processCurrent() {
    if (!this.images.length || !this.layer) return;

    const it = this.images[this.idx];
    const base = await this.loadImage(it.url);

    // 1) Componer SIEMPRE al tamaño del canvas
    const off = document.createElement("canvas");
    off.width = this.canvasW;
    off.height = this.canvasH;
    const octx = off.getContext("2d")!;
    octx.clearRect(0, 0, off.width, off.height);
    octx.drawImage(
      base,
      this.layer.x,
      this.layer.y,
      this.layer.w * this.layer.sx,
      this.layer.h * this.layer.sy
    );

    // 2) Actualizar preview derecha
    const cR = this.canvasRRef.nativeElement;
    cR.width = this.canvasW;
    cR.height = this.canvasH;
    const rctx = cR.getContext("2d")!;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, this.canvasW, this.canvasH);
    rctx.drawImage(off, 0, 0);

    // 3) Guardar processed
    const preBlob = await this.canvasToBlob(off);
    if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
    it.processedBlob = preBlob;
    it.processedUrl = URL.createObjectURL(preBlob);
    this.canDownload = true;

    // 4) Si es el primer frame, fijar TEMPLATE (rect visible normalizado)
    if (!this.templateNorm && this.idx === 0) {
      const W = (this.layer.w * this.layer.sx) / this.canvasW;
      const H = (this.layer.h * this.layer.sy) / this.canvasH;
      const x = this.layer.x / this.canvasW;
      const y = this.layer.y / this.canvasH;
      this.templateNorm = { x, y, W, H };
    }
  }

  // Aplica el template a TODAS las imágenes (encuadre idéntico)
  async processAllWithCurrentTransform() {
    if (!this.images.length) return;
    // Aseguramos template: si aún no existe (no procesaste la 1.ª), lo tomamos del estado actual
    if (!this.templateNorm && this.layer) {
      const W = (this.layer.w * this.layer.sx) / this.canvasW;
      const H = (this.layer.h * this.layer.sy) / this.canvasH;
      const x = this.layer.x / this.canvasW;
      const y = this.layer.y / this.canvasH;
      this.templateNorm = { x, y, W, H };
    }

    for (let i = 0; i < this.images.length; i++) {
      await this.ensureStateFor(i); // esto aplica el template a state si no lo tenía
      await this.applyTemplateToIndex(i); // fuerza rect exacto (por si ya tenía otro)
      await this.processIndex(i);
    }
    this.viewerIndexProc = 0; // listo para rotar procesadas
    this.canDownloadZip = true;
  }

  // compone, guarda y no toca la UI actual
  private async processIndex(i: number) {
    const it = this.images[i];
    const base = await this.loadImage(it.url);
    const st = it.state!;
    const cnv = document.createElement("canvas");
    cnv.width = this.canvasW;
    cnv.height = this.canvasH;
    const ctx = cnv.getContext("2d")!;
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.drawImage(base, st.x, st.y, st.w * st.sx, st.h * st.sy);

    const blob = await this.canvasToBlob(cnv);
    if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
    it.processedBlob = blob;
    it.processedUrl = URL.createObjectURL(blob);
  }

  // fuerza que images[i].state adopte el rect destino del template
  private async applyTemplateToIndex(i: number) {
    const it = this.images[i];
    if (!it || !this.templateNorm) return;
    const img = await this.loadImage(it.url);
    const destX = this.templateNorm.x * this.canvasW;
    const destY = this.templateNorm.y * this.canvasH;
    const destW = this.templateNorm.W * this.canvasW;
    const destH = this.templateNorm.H * this.canvasH;

    it.state = {
      x: destX,
      y: destY,
      sx: destW / img.width,
      sy: destH / img.height,
      w: img.width,
      h: img.height,
    };
    if (i === this.idx) this.layer = it.state;
  }

  downloadEdited() {
    const canvas = this.canvasRRef?.nativeElement;
    if (!canvas) return;
    const base =
      (this.images?.[this.idx]?.name || "imagen").replace(/\.[^.]+$/, "") ||
      "imagen";
    const filename = `${base}_edit_${this.canvasW}x${this.canvasH}.png`;

    if (canvas.toBlob) {
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
        "image/png",
        1.0
      );
    } else {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = filename;
      a.click();
    }
  }

  // ============ Input / teclado ============
  @HostListener("window:keydown", ["$event"]) onKey(ev: KeyboardEvent) {
    if (ev.code === "Space") this.spaceDown = true;
  }
  @HostListener("window:keyup", ["$event"]) onKeyUp(ev: KeyboardEvent) {
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
    //this.redrawLeft();
    this.scheduleLeftRedraw();
  }

  onPointerDown(ev: PointerEvent) {
    if (!this.layer) return;
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
      //this.redrawLeft();
      this.scheduleLeftRedraw();
      return;
    }
    if (this.mode === "move") {
      this.layer.x = this.startLayer.x + dx;
      this.layer.y = this.startLayer.y + dy;
      //this.redrawLeft();
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
        // proporcional (como tenías)
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
        // no proporcional (estirar lateral / superior-inferior)
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
      //this.redrawLeft();
      this.scheduleLeftRedraw();
    }
  }

  onPointerUp(ev: PointerEvent) {
    try {
      this.canvasLRef.nativeElement.releasePointerCapture(ev.pointerId);
    } catch {}
    this.mode = "none";
    this.activeHandle = "none";

    // Si estamos en el primer frame, cada ajuste puede actualizar el template en vivo:
    if (this.layer && this.idx === 0) {
      const W = (this.layer.w * this.layer.sx) / this.canvasW;
      const H = (this.layer.h * this.layer.sy) / this.canvasH;
      const x = this.layer.x / this.canvasW;
      const y = this.layer.y / this.canvasH;
      this.templateNorm = { x, y, W, H };
    }
  }

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

  // ============ 360 viewers ============
  on360Down(ev: PointerEvent): void {
    this.drag360.active = true;
    this.drag360.lastX = ev.clientX;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  }
  on360Move(ev: PointerEvent, kind: "orig" | "proc"): void {
    if (!this.drag360.active || !this.images.length) return;
    const dx = ev.clientX - this.drag360.lastX;
    const step = Math.trunc(dx / 12);
    if (step !== 0) {
      if (kind === "orig") {
        this.viewerIndexOrig =
          (this.viewerIndexOrig + step) % this.images.length;
        if (this.viewerIndexOrig < 0)
          this.viewerIndexOrig += this.images.length;
      } else {
        const n = this.images.length;
        let next = (this.viewerIndexProc + step) % n;
        if (next < 0) next += n;
        this.viewerIndexProc = next;
      }
      this.drag360.lastX = ev.clientX;
    }
  }
  on360Up(ev: PointerEvent): void {
    this.drag360.active = false;
    (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
  }

  /** Centra la capa actual en el lienzo (manteniendo sx/sy y tamaño actual). */
  centerLayer(): void {
    if (!this.layer) return;
    const W = this.layer.w * this.layer.sx;
    const H = this.layer.h * this.layer.sy;
    this.layer.x = Math.round((this.canvasW - W) / 2);
    this.layer.y = Math.round((this.canvasH - H) / 2);
    this.scheduleLeftRedraw();
    //this.redrawLeft();

    // Si estás en el primer frame, actualizamos el template para el resto
    if (this.idx === 0) {
      this.templateNorm = {
        x: this.layer.x / this.canvasW,
        y: this.layer.y / this.canvasH,
        W: W / this.canvasW,
        H: H / this.canvasH,
      };
    }
  }

  /** (Opcional) Centrar solo en el eje X */
  centerLayerX(): void {
    if (!this.layer) return;
    const W = this.layer.w * this.layer.sx;
    this.layer.x = Math.round((this.canvasW - W) / 2);
    this.scheduleLeftRedraw();
    //this.redrawLeft();
    if (this.idx === 0 && this.templateNorm) {
      this.templateNorm.x = this.layer.x / this.canvasW;
    }
  }

  /** (Opcional) Centrar solo en el eje Y */
  centerLayerY(): void {
    if (!this.layer) return;
    const H = this.layer.h * this.layer.sy;
    this.layer.y = Math.round((this.canvasH - H) / 2);
    //this.redrawLeft();
    this.scheduleLeftRedraw();
    if (this.idx === 0 && this.templateNorm) {
      this.templateNorm.y = this.layer.y / this.canvasH;
    }
  }
  async downloadAllZip(): Promise<void> {
    if (!this.images.length) return;

    // Asegurar que TODAS estén procesadas con el formato/calidad actual
    for (let i = 0; i < this.images.length; i++) {
      const it = this.images[i];
      const needFormat =
        !it.processedBlob ||
        (this.outputType === "image/webp" &&
          it.processedBlob.type !== "image/webp") ||
        (this.outputType === "image/png" &&
          it.processedBlob.type !== "image/png");

      if (needFormat) {
        await this.ensureStateFor(i);
        await this.applyTemplateToIndex(i);
        await this.processIndex(i); // usa outputType + quality actuales
      }
    }

    // Cargar libs on-demand
    const JSZip = (await import("jszip")).default;
    const { saveAs } = await import("file-saver");

    const zip = new JSZip();
    const ext = this.outputType === "image/webp" ? "webp" : "png";

    // Agregar todos los blobs al ZIP con el nombre correcto
    for (let i = 0; i < this.images.length; i++) {
      const it = this.images[i];
      const base = (it.name || `frame_${i + 1}`).replace(/\.[^.]+$/, "");
      const filename = `${base}_edit_${this.canvasW}x${this.canvasH}.${ext}`;
      zip.file(filename, it.processedBlob!);
    }

    // Descargar zip
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fmtTag = ext.toUpperCase();
    const qTag =
      this.outputType === "image/webp"
        ? `_q${Math.round(this.quality * 100)}`
        : "";
    saveAs(
      zipBlob,
      `edits_${this.canvasW}x${this.canvasH}_${fmtTag}${qTag}_${stamp}.zip`
    );
  }

  // async downloadAllZip(): Promise<void> {
  //   if (!this.images.length) return;

  //   // Asegurar que todas estén procesadas (por si el usuario no presionó Aplicar a 360)
  //   for (let i = 0; i < this.images.length; i++) {
  //     if (!this.images[i].processedBlob) {
  //       await this.ensureStateFor(i);
  //       await this.applyTemplateToIndex(i);
  //       await this.processIndex(i);
  //     }
  //   }

  //   // Cargar libs on-demand (no bloquean tu bundle principal)
  //   const JSZip = (await import("jszip")).default;
  //   const { saveAs } = await import("file-saver");

  //   const zip = new JSZip();

  //   this.images.forEach((it, i) => {
  //     const base = (it.name || `frame_${i + 1}`).replace(/\.[^.]+$/, "");
  //     const filename = `${base}_edit_${this.canvasW}x${this.canvasH}.png`;
  //     const blob = it.processedBlob!;
  //     zip.file(filename, blob);
  //   });

  //   const zipBlob = await zip.generateAsync({ type: "blob" });
  //   const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  //   saveAs(zipBlob, `edits_${this.canvasW}x${this.canvasH}_${stamp}.zip`);
  // }

  // info de tamaños (del frame actual)
  get originalBytes(): number {
    return this.images[this.idx]?.file?.size ?? 0;
  }
  get processedBytes(): number {
    return this.images[this.idx]?.processedBlob?.size ?? 0;
  }
  get savingPct(): number | null {
    if (!this.originalBytes || !this.processedBytes) return null;
    return +((1 - this.processedBytes / this.originalBytes) * 100).toFixed(1);
  }

  // util para UI
  formatBytes(n: number): string {
    if (!n) return "—";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    let x = n;
    while (x >= 1024 && i < u.length - 1) {
      x /= 1024;
      i++;
    }
    return `${x.toFixed(x < 10 && i > 0 ? 2 : 1)} ${u[i]}`;
  }

  get savingAbs(): number {
    const s = this.savingPct;
    return s == null ? 0 : Math.abs(s);
  }
  get savingSign(): string {
    const s = this.savingPct ?? 0;
    return s >= 0 ? "−" : "+";
  }

  async processAll(): Promise<void> {
    if (!this.images.length) return;

    // 1) Fijar/actualizar template desde el frame actual (estado visible)
    if (this.layer) {
      const W = (this.layer.w * this.layer.sx) / this.canvasW;
      const H = (this.layer.h * this.layer.sy) / this.canvasH;
      const x = this.layer.x / this.canvasW;
      const y = this.layer.y / this.canvasH;
      this.templateNorm = { x, y, W, H };
    } else {
      // si por alguna razón no hay layer aún, asegúrala
      await this.ensureStateFor(this.idx);
      this.layer = this.images[this.idx].state!;
    }

    // 2) Procesar el frame actual primero (y refrescar preview derecha)
    await this.applyTemplateToIndex(this.idx);
    await this.processIndex(this.idx);
    this.canDownload = true;

    // Pintar preview derecha con la imagen procesada actual
    const itCur = this.images[this.idx];
    if (itCur?.processedUrl) {
      const cR = this.canvasRRef.nativeElement;
      cR.width = this.canvasW;
      cR.height = this.canvasH;
      const rctx = cR.getContext("2d")!;
      rctx.setTransform(1, 0, 0, 1, 0, 0);
      rctx.clearRect(0, 0, this.canvasW, this.canvasH);
      const im = new Image();
      im.onload = () => rctx.drawImage(im, 0, 0, this.canvasW, this.canvasH);
      im.src = itCur.processedUrl;
    }

    // 3) Procesar el resto con el mismo template, formato y calidad
    for (let i = 0; i < this.images.length; i++) {
      if (i === this.idx) continue;
      await this.ensureStateFor(i);
      await this.applyTemplateToIndex(i);
      await this.processIndex(i); // respeta outputType + quality actuales
    }

    // 4) Habilitar ZIP
    this.canDownloadZip = true;
  }

  private async urlToBitmap(url: string): Promise<ImageBitmap> {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob);
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

  private scheduleLeftRedraw() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.redrawLeftCore();
    });
  }

  onAuxClick(ev: MouseEvent) {
    // 1 = middle button. Lo anulamos para que no active autoscroll del navegador ni nada en el stage
    if (ev.button === 1) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }
}
