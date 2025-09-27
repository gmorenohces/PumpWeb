import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";

type DialogType = "success" | "error" | "info";
type DialogData = {
  message: string;
  type?: DialogType;
  title?: string;
  icon?: string;
};

@Component({
  selector: "app-success-dialog",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./success-dialog.component.html",
  styleUrls: ["./success-dialog.component.css"],
})
export class SuccessDialogComponent {
  icon: string;
  title: string;
  panelClass: string;

  constructor(
    private ref: MatDialogRef<SuccessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    const t: DialogType = data.type ?? "info";
    this.icon =
      data.icon ??
      (t === "error" ? "error" : t === "success" ? "check_circle" : "info");
    this.title =
      data.title ??
      (t === "error"
        ? "Ocurrió un problema"
        : t === "success"
        ? "¡Listo!"
        : "Información");
    this.panelClass = `dialog-${t}`;
  }

  close() {
    this.ref.close();
  }
}
