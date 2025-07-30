// import {
//   Component,
//   AfterViewInit,
//   ViewChild,
//   ElementRef,
//   OnDestroy,
//   HostListener,
// } from "@angular/core";
// import { CommonModule } from "@angular/common";
// import { FormsModule } from "@angular/forms";
// import { DataService } from "../../services/data/data.service";
// import { Subscription } from "rxjs";
// @Component({
//   selector: "app-generate-out-painting",
//   standalone: true,
//   imports: [CommonModule, FormsModule],
//   templateUrl: "./generate-out-painting.component.html",
//   styleUrls: ["./generate-out-painting.component.css"],
// })
// export class GenerateOutPaintingComponent implements AfterViewInit, OnDestroy {
//   @ViewChild("canvasEl", { static: true })
//   canvasRef!: ElementRef<HTMLCanvasElement>;
//   @ViewChild("fileInput", { static: true })
//   fileInput!: ElementRef<HTMLInputElement>;

//   private readonly BASE_SIZE = 1024;
//   ratios = [
//     { label: "1:1 (Square)", value: [1, 1] },
//     { label: "16:9 (Widescreen)", value: [16, 9] },
//     { label: "9:16 (Vertical)", value: [9, 16] },
//     { label: "Custom (px)", value: null },
//   ];
//   selectedRatio: [number, number] | null = this.ratios[3].value as [
//     number,
//     number
//   ];

//   customWidth = 1024;
//   customHeight = 1024;

//   offsets = { left: 0, down: 0, right: 0, up: 0 };
//   resultUrlROI = "";

//   private ctx!: CanvasRenderingContext2D;
//   private img = new Image();
//   private imgX = 0;
//   private imgY = 0;
//   private dragging = false;
//   private dragStartX = 0;
//   private dragStartY = 0;
//   private resizeObserver!: ResizeObserver;
//   private sub?: Subscription;

//   constructor(private dataService: DataService) {}

//   ngAfterViewInit(): void {
//     const canvas = this.canvasRef.nativeElement;
//     this.ctx = canvas.getContext("2d")!;
//     this.resizeObserver = new ResizeObserver(() => this.redraw());
//     this.resizeObserver.observe(canvas.parentElement!);
//     this.redraw();
//   }

//   ngOnDestroy(): void {
//     this.resizeObserver.disconnect();
//     this.sub?.unsubscribe();
//   }

//   onFileChange(): void {
//     const file = this.fileInput.nativeElement.files?.[0];
//     if (!file) return;
//     const url = URL.createObjectURL(file);
//     this.img.onload = () => {
//       const canvas = this.canvasRef.nativeElement;
//       const dispW = canvas.width;
//       const dispH = canvas.height;
//       const imgScale = Math.min(
//         dispW / this.img.width,
//         dispH / this.img.height,
//         1
//       );
//       this.imgX = (dispW - this.img.width * imgScale) / 2;
//       this.imgY = (dispH - this.img.height * imgScale) / 2;
//       this.redraw();
//       URL.revokeObjectURL(url);
//     };
//     this.img.src = url;
//   }

//   updateRatio(): void {
//     this.imgX = 0;
//     this.imgY = 0;
//     this.redraw();
//   }

//   updateCustom(): void {
//     this.imgX = 0;
//     this.imgY = 0;
//     this.redraw();
//   }

//   private redraw(): void {
//     const canvas = this.canvasRef.nativeElement;
//     const parent = canvas.parentElement!;
//     const maxW = parent.clientWidth * 1.0;
//     const maxH = window.innerHeight - 0;

//     let regionW: number, regionH: number;
//     if (this.selectedRatio) {
//       const [rw, rh] = this.selectedRatio;
//       regionW = this.BASE_SIZE;
//       regionH = Math.round((this.BASE_SIZE * rh) / rw);
//     } else {
//       regionW = this.customWidth;
//       regionH = this.customHeight;
//     }

//     const scale = 1; //Math.min(maxW / regionW, maxH / regionH, 1);
//     const dispW = regionW * scale;
//     const dispH = regionH * scale;
//     canvas.width = dispW;
//     canvas.height = dispH;

//     this.ctx.fillStyle = "#333";
//     this.ctx.fillRect(0, 0, dispW, dispH);

//     if (this.img.complete) {
//       this.ctx.save();
//       this.ctx.beginPath();
//       this.ctx.rect(0, 0, dispW, dispH);
//       this.ctx.clip();
//       const imgScale = Math.min(
//         dispW / this.img.width,
//         dispH / this.img.height,
//         1
//       );
//       const iw = this.img.width * imgScale;
//       const ih = this.img.height * imgScale;
//       this.ctx.drawImage(this.img, this.imgX, this.imgY, iw, ih);
//       this.ctx.restore();
//     }

//     this.ctx.strokeStyle = "#00f";
//     this.ctx.lineWidth = 2;
//     this.ctx.strokeRect(0, 0, dispW, dispH);
//   }

//   @HostListener("mousedown", ["$event"])
//   onMouseDown(evt: MouseEvent): void {
//     const rect = this.canvasRef.nativeElement.getBoundingClientRect();
//     const x = evt.clientX - rect.left;
//     const y = evt.clientY - rect.top;
//     if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
//       this.dragging = true;
//       this.dragStartX = evt.clientX;
//       this.dragStartY = evt.clientY;
//     }
//   }

//   @HostListener("mousemove", ["$event"])
//   onMouseMove(evt: MouseEvent): void {
//     if (!this.dragging) return;
//     this.imgX += evt.clientX - this.dragStartX;
//     this.imgY += evt.clientY - this.dragStartY;
//     console.log("Imagen desplazada a:", this.imgX, this.imgY);

//     this.dragStartX = evt.clientX;
//     this.dragStartY = evt.clientY;
//     this.redraw();
//   }

//   @HostListener("mouseup")
//   onMouseUp(): void {
//     this.dragging = false;
//   }

//   exportMask(): void {
//     const canvas = this.canvasRef.nativeElement;
//     const dispW = canvas.width;
//     const dispH = canvas.height;

//     const regionW = this.selectedRatio ? this.BASE_SIZE : this.customWidth;
//     const regionH = this.selectedRatio
//       ? Math.round(
//           (this.BASE_SIZE * this.selectedRatio[1]) / this.selectedRatio[0]
//         )
//       : this.customHeight;

//     const imgScale = Math.min(
//       dispW / this.img.width,
//       dispH / this.img.height,
//       1
//     );

//     // displayed image size
//     const dispImgW = this.img.width * imgScale;
//     const dispImgH = this.img.height * imgScale;

//     // blank regions in display
//     const blankLeftDisp = this.imgX > 0 ? this.imgX : 0;
//     const blankUpDisp = this.imgY > 0 ? this.imgY : 0;
//     const blankRightDisp =
//       dispImgW + this.imgX < dispW ? dispW - (dispImgW + this.imgX) : 0;
//     const blankDownDisp =
//       dispImgH + this.imgY < dispH ? dispH - (dispImgH + this.imgY) : 0;

//     // offsets in original pixels
//     const left = Math.round(blankLeftDisp / imgScale);
//     const up = Math.round(blankUpDisp / imgScale);
//     const right = Math.round(blankRightDisp / imgScale);
//     const down = Math.round(blankDownDisp / imgScale);

//     this.offsets = { left, down, right, up };
//     console.log("Offsets a enviar:", this.offsets);

//     // ROI in original image
//     const sx = this.imgX < 0 ? Math.round(-this.imgX / imgScale) : 0;
//     const sy = this.imgY < 0 ? Math.round(-this.imgY / imgScale) : 0;
//     const sw = regionW - left - right;
//     const sh = regionH - up - down;

//     const roiCanvas = document.createElement("canvas");
//     roiCanvas.width = sw;
//     roiCanvas.height = sh;
//     const rctx = roiCanvas.getContext("2d")!;
//     rctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);
//     this.resultUrlROI = roiCanvas.toDataURL("image/png");

//     // aquí podrías enviar el form con offsets
//   }
// }
import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DataService } from "../../services/data/data.service";
import { Subscription } from "rxjs";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatFormFieldModule } from "@angular/material/form-field";

@Component({
  selector: "app-generate-out-painting",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
  ],
  templateUrl: "./generate-out-painting.component.html",
  styleUrls: ["./generate-out-painting.component.css"],
})
export class GenerateOutPaintingComponent implements AfterViewInit, OnDestroy {
  @ViewChild("canvasEl", { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("fileInput", { static: true })
  fileInput!: ElementRef<HTMLInputElement>;

  private readonly BASE_SIZE = 1024;
  ratios = [
    { label: "1:1 (Square)", value: [1, 1] },
    { label: "16:9 (Widescreen)", value: [16, 9] },
    { label: "9:16 (Vertical)", value: [9, 16] },
    { label: "Custom (px)", value: null },
  ];
  selectedRatio: [number, number] | null = this.ratios[0].value as [
    number,
    number
  ];

  customWidth = 1024;
  customHeight = 1024;
  bandProcess = 0;

  offsets = { left: 0, down: 0, right: 0, up: 0 };
  resultUrlROI = "";

  private ctx!: CanvasRenderingContext2D;
  private img = new Image();
  private imgX = 0;
  private imgY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private resizeObserver!: ResizeObserver;
  private sub?: Subscription;

  constructor(private dataService: DataService) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext("2d")!;
    this.resizeObserver = new ResizeObserver(() => this.redraw());
    this.resizeObserver.observe(canvas);
    this.redraw();
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.sub?.unsubscribe();
  }

  onFileChange(): void {
    const file = this.fileInput.nativeElement.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    this.img.onload = () => {
      this.centerImage();
      this.redraw();
      URL.revokeObjectURL(url);
    };
    this.img.src = url;
  }

  updateRatio(): void {
    this.centerImage();
    this.redraw();
  }
  updateCustom(): void {
    this.centerImage();
    this.redraw();
  }

  /** Always center without scaling: show original size, clip overflow */
  private centerImage(): void {
    const canvas = this.canvasRef.nativeElement;
    const regionW = canvas.width;
    const regionH = canvas.height;
    this.imgX = (regionW - this.img.width) / 2;
    this.imgY = (regionH - this.img.height) / 2;
  }

  private redraw(): void {
    const canvas = this.canvasRef.nativeElement;

    // determine region size exactly
    const regionW = this.selectedRatio ? this.BASE_SIZE : this.customWidth;
    const regionH = this.selectedRatio
      ? Math.round(
          (this.BASE_SIZE * this.selectedRatio![1]) / this.selectedRatio![0]
        )
      : this.customHeight;

    canvas.width = regionW;
    canvas.height = regionH;

    // background
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(0, 0, regionW, regionH);

    if (this.img.complete) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, regionW, regionH);
      this.ctx.clip();
      // draw at original size, clipped by region
      this.ctx.drawImage(
        this.img,
        this.imgX,
        this.imgY,
        this.img.width,
        this.img.height
      );
      this.ctx.restore();
    }

    // border
    this.ctx.strokeStyle = "#00f";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, regionW, regionH);
  }

  @HostListener("mousedown", ["$event"])
  onMouseDown(evt: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      this.dragging = true;
      this.dragStartX = evt.clientX;
      this.dragStartY = evt.clientY;
    }
  }

  @HostListener("mousemove", ["$event"])
  onMouseMove(evt: MouseEvent): void {
    if (!this.dragging) return;
    this.imgX += evt.clientX - this.dragStartX;
    this.imgY += evt.clientY - this.dragStartY;
    this.dragStartX = evt.clientX;
    this.dragStartY = evt.clientY;
    this.redraw();
  }

  @HostListener("mouseup")
  onMouseUp(): void {
    this.dragging = false;
  }

  exportMask(): void {
    const canvas = this.canvasRef.nativeElement;
    const regionW = canvas.width;
    const regionH = canvas.height;

    // calculate blank margins in displayed coords
    const blankLeft = Math.max(this.imgX, 0);
    const blankUp = Math.max(this.imgY, 0);
    const blankRight = Math.max(regionW - (this.imgX + this.img.width), 0);
    const blankDown = Math.max(regionH - (this.imgY + this.img.height), 0);

    // offsets directly in original pixels
    const left = Math.round(blankLeft);
    const up = Math.round(blankUp);
    const right = Math.round(blankRight);
    const down = Math.round(blankDown);
    this.offsets = { left, down, right, up };

    console.log("Offsets a enviar:", this.offsets);

    // ROI in original image coords
    const sx = this.imgX < 0 ? -this.imgX : 0;
    const sy = this.imgY < 0 ? -this.imgY : 0;
    const sw = regionW - left - right;
    const sh = regionH - up - down;

    const roiCanvas = document.createElement("canvas");
    roiCanvas.width = sw;
    roiCanvas.height = sh;
    const rctx = roiCanvas.getContext("2d")!;
    rctx.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);
    this.resultUrlROI = roiCanvas.toDataURL("image/png");
    this.bandProcess = 0;
    // TODO: enviar ROI al backend usando this.offsets
    // enviar ROI al backend usando this.offsets
    const form = new FormData();
    roiCanvas.toBlob((blob) => {
      if (!blob) return;
      form.append("image", blob, "roi.png");
      form.append("left", left.toString());
      form.append("down", down.toString());
      form.append("right", right.toString());
      form.append("up", up.toString());
      form.append("output_format", "png");
      this.sub = this.dataService.outpaint(form).subscribe({
        next: (b) => {
          console.log("Outpaint result blob:", b);
          this.bandProcess = 1;
          this.resultUrlROI = URL.createObjectURL(b);
        },
        error: (e) => console.error("Outpaint error", e),
      });
    });
  }
  newProcess() {
    this.fileInput.nativeElement.value = "";
    //this.img.src = "";
    this.bandProcess = 0;
    this.resultUrlROI = "";
    this.offsets = { left: 0, down: 0, right: 0, up: 0 };
    this.selectedRatio = this.ratios[0].value as [number, number];
    this.customWidth = 1024;
    this.customHeight = 1024;
    this.redraw();
  }

  download() {
    if (!this.resultUrlROI) return;
    const link = document.createElement("a");
    link.href = this.resultUrlROI;
    link.download = "roi.png";
    link.click();
  }
}
