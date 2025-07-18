// generate-image.component.ts
import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCardModule } from "@angular/material/card";
import { OpenAIService } from "../../services/openAI/open-ai.service";

interface Node {
  id: string; // "A", "B", "C", "D"
  prompt?: string; // el prompt usado
  url?: string; // la URL devuelta por OpenAI
}

@Component({
  selector: "app-generate-image",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
  ],
  templateUrl: "./generate-image.component.html",
  styleUrls: ["./generate-image.component.css"],
})
export class GenerateImageComponent {
  // banner
  bannerUrl = "/images/ban_images_cut.png";
  bannerHeight = 250;

  // formulario
  nodes: Node[] = [{ id: "A" }];
  selectedNodeIndex = 0; // índice en `nodes`
  prompt = "";
  numImages = 1;

  // estado
  loading = false;
  generatedUrl: string | null = null;

  constructor(private ai: OpenAIService) {}

  canGenerate() {
    return (
      this.prompt.trim().length > 0 &&
      this.numImages >= 1 &&
      this.numImages <= 10
    );
  }

  addNode() {
    if (this.nodes.length >= 4) return;
    const nextId = String.fromCharCode(65 + this.nodes.length);
    this.nodes.push({ id: nextId });
  }

  generate() {
    if (!this.canGenerate()) return;
    const node = this.nodes[this.selectedNodeIndex];
    node.prompt = this.prompt;

    this.ai.generate(this.prompt, 1).subscribe({
      next: (resp) => {
        node.url = resp.data[0]?.url;
      },
      error: (err) => console.error(err),
    });
  }
}
