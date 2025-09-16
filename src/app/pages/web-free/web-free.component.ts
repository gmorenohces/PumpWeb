import { Component, ElementRef, ViewChild, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatMenuModule } from "@angular/material/menu";
import { MatDividerModule } from "@angular/material/divider";

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

  ngAfterViewInit() {
    this.ctxL = this.canvasLRef.nativeElement.getContext("2d");
    this.ctxR = this.canvasRRef.nativeElement.getContext("2d");
    this.redrawBoth();
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
  }

  private async ensureStateFor(index: number) {
    const it = this.images[index];
    if (!it) return;
    if (it.state) return;
    const img = await this.loadImage(it.url);
    // centrado con ~60% del lienzo
    const maxSide = Math.max(img.width, img.height);
    const target = 1.0 * Math.max(this.canvasW, this.canvasH);
    const s = Math.min(target / maxSide, 1);
    it.state = {
      x: (this.canvasW - img.width * s) / 2,
      y: (this.canvasH - img.height * s) / 2,
      sx: s,
      sy: s,
      w: img.width,
      h: img.height,
    };
  }
  private attachLayerFromIndex(index: number) {
    this.layer = this.images[index]?.state ?? null;
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
    this.redrawLeft();
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

  /* ========= Procesar (rasterizar) ========= */
  // async processCurrent() {
  //   if (!this.images.length || !this.layer) return;
  //   const it = this.images[this.idx];
  //   const base = await this.loadImage(it.url);

  //   const canvas = document.createElement("canvas");
  //   canvas.width = this.canvasW;
  //   canvas.height = this.canvasH;
  //   const ctx = canvas.getContext("2d")!;
  //   ctx.clearRect(0, 0, canvas.width, canvas.height);
  //   // fondo transparente (checker solo es visual en el viewer)
  //   ctx.drawImage(
  //     base,
  //     this.layer.x,
  //     this.layer.y,
  //     this.layer.w * this.layer.sx,
  //     this.layer.h * this.layer.sy
  //   );

  //   const blob: Blob = await new Promise((res) =>
  //     canvas.toBlob((b) => res(b!), "image/png")
  //   );
  //   if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
  //   it.processedBlob = blob;
  //   it.processedUrl = URL.createObjectURL(blob);

  //   this.redrawRight();
  //   this.markProcessedReady();
  // }

  async processCurrent() {
    if (!this.images.length || !this.layer) return;

    // 1) Cargar base
    const it = this.images[this.idx];
    const base = await this.loadImage(it.url);

    // 2) Lienzo offscreen EXACTO al preset (salida final)
    const outW = this.canvasW;
    const outH = this.canvasH;
    const off = document.createElement("canvas");
    off.width = outW;
    off.height = outH;
    const octx = off.getContext("2d")!;
    // Asegura estado limpio
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, outW, outH);

    // 3) Dibuja la imagen con la transform del layer (tu lógica)
    //    IMPORTANTE: aquí estás posicionando/escalando la imagen sobre el lienzo final
    octx.drawImage(
      base,
      this.layer.x,
      this.layer.y,
      this.layer.w * this.layer.sx,
      this.layer.h * this.layer.sy
    );

    // 4) Blob + URL del resultado final a tamaño exacto
    const blob: Blob = await new Promise((res) =>
      off.toBlob((b) => res(b!), "image/png", 1.0)
    );

    if (it.processedUrl) URL.revokeObjectURL(it.processedUrl);
    it.processedBlob = blob;
    it.processedUrl = URL.createObjectURL(blob);

    // 5) Actualiza el canvas de la derecha AL MISMO TAMAÑO DEL PRESET
    const cR = this.canvasRRef.nativeElement;
    cR.width = outW;
    cR.height = outH;
    const rctx = cR.getContext("2d")!;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, outW, outH);
    // Dibuja el resultado 1:1 para previsualizarlo
    rctx.drawImage(off, 0, 0);

    // 6) (opcional) si tu preview usa otra ruta, puedes seguir usando tu método
    // this.redrawRight(); // solo si dependes de él para overlays/HUD

    // 7) Habilita el botón de descarga
    this.markProcessedReady(); // o this.canDownload = true;
  }

  downloadEdited() {
    const canvas = this.canvasRRef?.nativeElement; // <-- aquí
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
  }
  zoomFit() {
    const c = this.canvasLRef.nativeElement;
    const rect = c.getBoundingClientRect();
    const s = Math.min(rect.width / this.canvasW, rect.height / this.canvasH);
    this.vp.scale = Math.max(0.1, Math.min(8, s));
    this.vp.ox = (rect.width - this.canvasW * this.vp.scale) / 2;
    this.vp.oy = (rect.height - this.canvasH * this.vp.scale) / 2;
    this.redrawLeft();
  }
  zoomReset() {
    this.vp.scale = 0.8;
    this.vp.ox = 0;
    this.vp.oy = 0;
    this.redrawLeft();
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
    this.redrawLeft();
  }

  onPointerDown(ev: PointerEvent) {
    if (!this.layer) return;
    const c = this.canvasLRef.nativeElement;
    c.setPointerCapture(ev.pointerId);

    const wpt = this.screenToWorld(ev.offsetX, ev.offsetY);
    const handle = this.hitTestHandle(wpt.x, wpt.y);

    if (this.spaceDown || ev.button === 1) {
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
      this.redrawLeft();
      return;
    }
    if (this.mode === "move") {
      this.layer.x = this.startLayer.x + dx;
      this.layer.y = this.startLayer.y + dy;
      this.redrawLeft();
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
      this.redrawLeft();
    }
  }

  onPointerUp(ev: PointerEvent) {
    try {
      this.canvasLRef.nativeElement.releasePointerCapture(ev.pointerId);
    } catch {}
    this.mode = "none";
    this.activeHandle = "none";
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
    });
  }
  ngOnDestroy() {
    this.disposeUrls();
  }
}
