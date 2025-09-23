import { CommonModule } from "@angular/common";
import { Component, ElementRef, ViewChild, NgZone } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { environment } from "../../../environments/environment";

type Msg = { role: "user" | "assistant"; text: string };

@Component({
  selector: "app-chat-assistant",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./chat-assistant.component.html",
  styleUrls: ["./chat-assistant.component.css"], // 👈 corregido
})
export class ChatAssistantComponent {
  @ViewChild("scrollArea") scrollArea!: ElementRef<HTMLDivElement>;
  // Ajusta si es otro puerto/host:
  private API_BASE = environment.apiUrl;
  private CHAT_SSE_URL = `${this.API_BASE}/chat/stream`; // POST -> SSE
  private CHAT_HISTORY_URL = `${this.API_BASE}/chat/history`; // GET -> JSON

  // Banner (como en text-image)
  bannerUrl = "/images/ban_images.png";
  bannerHeight = 250;

  messages: Msg[] = [];
  input = "";
  sending = false;
  typing = false;
  sessionId: string | null = localStorage.getItem("pump_session_id");

  // (opcional) mostrar estado "queued/in_progress/completed"
  statusMsg = "";

  constructor(private zone: NgZone) {
    if (this.sessionId) this.reloadHistory();
  }

  private persistSession(id: string) {
    this.sessionId = id;
    localStorage.setItem("pump_session_id", id);
  }

  private scrollToBottom() {
    queueMicrotask(() => {
      this.scrollArea?.nativeElement.scrollTo({
        top: this.scrollArea.nativeElement.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  async reloadHistory() {
    if (!this.sessionId) return;
    const sid = this.sessionId; // narrow a string
    try {
      const r = await fetch(
        `${this.CHAT_HISTORY_URL}?session_id=${encodeURIComponent(sid)}`
      );
      const j = await r.json();
      if (j.ok) {
        this.messages = (j.messages || []).map((m: any) => ({
          role: m.role,
          text: m.content,
        }));
        this.scrollToBottom();
      }
    } catch (e) {
      console.error("history error", e);
    }
  }

  newSession() {
    localStorage.removeItem("pump_session_id");
    this.sessionId = null;
    this.messages = [];
    this.statusMsg = "";
  }

  async send() {
    const text = this.input.trim();
    if (!text) return;

    // pinta mensaje del usuario
    this.zone.run(() => {
      this.messages.push({ role: "user", text });
      // placeholder del asistente vacío
      this.messages.push({ role: "assistant", text: "" });
      this.input = "";
      this.typing = true;
      this.sending = true;
      this.statusMsg = "";
    });
    this.scrollToBottom();

    const resp = await fetch(this.CHAT_SSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        session_id: this.sessionId ?? undefined, // si no hay, el back crea
      }),
    });

    const reader = resp.body?.getReader();
    if (!reader) {
      this.zone.run(() => {
        this.typing = false;
        this.sending = false;
      });
      return;
    }

    const td = new TextDecoder();
    let buf = "";
    let acc = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += td.decode(value, { stream: true });

      // eventos SSE separados por línea en blanco
      const chunks = buf.split("\n\n");
      buf = chunks.pop() || "";

      for (const raw of chunks) {
        if (!raw.startsWith("data:")) continue;

        try {
          const payload = JSON.parse(raw.slice(5).trim());

          if (
            payload.type === "info" &&
            typeof payload.session_id === "string"
          ) {
            this.zone.run(() => this.persistSession(payload.session_id));
          } else if (payload.type === "status") {
            // opcional: muestra estado
            this.zone.run(() => (this.statusMsg = payload.message || ""));
          } else if (
            payload.type === "delta" &&
            typeof payload.text === "string"
          ) {
            acc += payload.text;
            // re-asignar el último mensaje (assistant) para forzar CD
            this.zone.run(() => {
              const idx = this.messages.length - 1;
              const last = this.messages[idx];
              this.messages[idx] = { ...last, text: acc };
            });
            this.scrollToBottom();
          } else if (payload.type === "done") {
            this.zone.run(() => {
              this.typing = false;
              this.sending = false;
              this.statusMsg = "";
              if (typeof payload.session_id === "string" && !this.sessionId) {
                this.persistSession(payload.session_id);
              }
            });
          } else if (payload.type === "error") {
            this.zone.run(() => {
              const idx = this.messages.length - 1;
              const last = this.messages[idx];
              this.messages[idx] = {
                ...last,
                text:
                  (acc ? acc + "\n\n" : "") +
                  `[Error]: ${payload.message ?? "unknown error"}`,
              };
              this.typing = false;
              this.sending = false;
            });
          }
        } catch {
          // ignora eventos malformados
        }
      }
    }
  }
}
