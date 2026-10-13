import { applyPatch, type RoomPatch } from "./room-sync";
import type { RoomView } from "./types";

type SessionError = { status: number; message: string };
type Callbacks = {
  view: (view: RoomView) => boolean;
  heartbeat: (serverTime: number) => void;
  error: () => void;
  sessionError: (error: SessionError) => void;
};

/** Each connection owns its patch base. Only a caught-up snapshot can replace it. */
export class RoomEventStream {
  private active?: EventSource;
  private replacement?: EventSource;
  private replacementTimeout?: ReturnType<typeof setTimeout>;
  private version = -1;

  constructor(
    private url: string,
    private callbacks: Callbacks,
    private create: (url: string) => EventSource = (url) =>
      new EventSource(url),
  ) {}

  get readyState() {
    return this.active?.readyState;
  }

  close() {
    this.active?.close();
    this.active = undefined;
    this.cancelReplacement();
  }

  connect() {
    this.close();
    this.open(false);
  }

  private cancelReplacement() {
    clearTimeout(this.replacementTimeout);
    this.replacement?.close();
    this.replacement = undefined;
  }

  private open(replacing: boolean) {
    const source = this.create(this.url);
    let wireView: RoomView | null = null;
    if (replacing) {
      this.replacement = source;
      // A failed handoff must not keep an unverified stream alive indefinitely.
      this.replacementTimeout = setTimeout(
        () => this.cancelReplacement(),
        8000,
      );
    } else this.active = source;
    const current = () => source === this.active || source === this.replacement;
    const accept = () => {
      if (
        !wireView ||
        wireView.version < this.version ||
        !this.callbacks.view(wireView)
      )
        return;
      this.version = wireView.version;
      if (source === this.replacement) {
        const old = this.active;
        this.active = source;
        this.replacement = undefined;
        clearTimeout(this.replacementTimeout);
        old?.close();
      }
    };
    const invalid = () => {
      if (source === this.replacement) this.cancelReplacement();
      else {
        this.callbacks.error();
        this.connect();
      }
    };
    source.addEventListener("snapshot", (event: MessageEvent<string>) => {
      if (!current()) return;
      try {
        wireView = JSON.parse(event.data) as RoomView;
        accept();
      } catch {
        invalid();
      }
    });
    source.addEventListener("patch", (event: MessageEvent<string>) => {
      if (!current()) return;
      try {
        if (!wireView) throw new Error("Snapshot required");
        wireView = applyPatch(wireView, JSON.parse(event.data) as RoomPatch);
        accept();
      } catch {
        invalid();
      }
    });
    source.addEventListener("heartbeat", (event: MessageEvent<string>) => {
      if (source !== this.active || !wireView) return;
      try {
        this.callbacks.heartbeat(
          (JSON.parse(event.data) as { serverTime: number }).serverTime,
        );
      } catch {
        invalid();
      }
    });
    source.addEventListener("rotate", () => {
      if (source === this.active && !this.replacement) this.open(true);
    });
    source.addEventListener("session-error", (event: MessageEvent<string>) => {
      if (!current()) return;
      try {
        const error = JSON.parse(event.data) as SessionError;
        if ([401, 404].includes(error.status)) this.close();
        else if (source === this.replacement) {
          this.cancelReplacement();
          return;
        }
        this.callbacks.sessionError(error);
      } catch {
        invalid();
      }
    });
    source.onerror = () => {
      if (!current()) return;
      if (source === this.replacement) this.cancelReplacement();
      else {
        wireView = null;
        this.callbacks.error();
      }
    };
  }
}
