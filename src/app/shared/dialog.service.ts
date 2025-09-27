import { Injectable } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { SuccessDialogComponent } from "./success-dialog/success-dialog.component";

@Injectable({ providedIn: "root" })
export class DialogService {
  constructor(private dialog: MatDialog) {}

  showError(message: string) {
    this.dialog.open(SuccessDialogComponent, {
      width: "380px",
      data: { type: "error", message },
      panelClass: "dialog-error",
    });
  }

  showInfo(message: string) {
    this.dialog.open(SuccessDialogComponent, {
      width: "380px",
      data: { type: "info", message },
      panelClass: "dialog-info",
    });
  }

  showSuccess(message: string) {
    this.dialog.open(SuccessDialogComponent, {
      width: "380px",
      data: { type: "success", message },
      panelClass: "dialog-success",
    });
  }
}
