// success-dialog.component.ts
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type DialogType = 'success' | 'error' | 'info';

export interface SuccessDialogData {
  type: DialogType;
  message: string;
}

@Component({
  selector: 'app-success-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './success-dialog.component.html',
  styleUrls: ['./success-dialog.component.css'],
})
export class SuccessDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SuccessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SuccessDialogData
  ) {}

  close(): void {
    this.dialogRef.close();
  }

  // para el título e icono dinámico
  get title() {
    switch (this.data.type) {
      case 'error':
        return 'Error';
      case 'info':
        return 'Información';
      default:
        return '¡Éxito!';
    }
  }
  get icon() {
    switch (this.data.type) {
      case 'error':
        return 'error';
      case 'info':
        return 'info';
      default:
        return 'check_circle';
    }
  }
  get panelClass() {
    return `dialog-${this.data.type}`;
  }
}
