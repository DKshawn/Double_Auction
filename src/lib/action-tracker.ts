import type { ClientAction, Operation } from "./action-log";
import { ActionQueue } from "./action-queue";
import { roomApiHref } from "./room-session";
import type { Command, RoomView } from "./types";

let blockCurrent: ((code: string, reason: string) => void) | undefined;
export function blockInteraction(errorCode: string, reason: string) {
  blockCurrent?.(errorCode, reason);
}

type Activation = {
  event: ClientAction;
  element?: HTMLElement;
  claimed: boolean;
  finished: boolean;
};
const commandButtons: Record<string, string> = {
  "study-quote": "quote.submit",
  quote: "quote.submit",
  "study-accept": "quote.accept-best",
  accept: "quote.accept-best",
};

export class ActionTracker {
  private queue = new ActionQueue();
  private tabId = crypto.randomUUID();
  private sequence = 0;
  private current?: Activation;
  private uploading = false;
  private disposed = false;
  private pendingCommands = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private cleanups: (() => void)[] = [];
  private reconciliations = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private code: string,
    private actor: string,
    private getView: () => RoomView | null,
    private getClockOffset: () => number,
  ) {}
  private get owner() {
    return `${this.code}:${this.actor}`;
  }
  private emit(event: ClientAction) {
    this.queue.put(this.owner, event);
  }
  private begin(
    button: string,
    label: string,
    method: ClientAction["method"],
    commandType?: string,
    element?: HTMLElement,
  ): Activation {
    const view = this.getView();
    const clickedAt = Date.now();
    const event: ClientAction = {
      id: crypto.randomUUID(),
      interaction: {
        id: crypto.randomUUID(),
        button: button.slice(0, 120),
        clickedAt,
        clockOffsetMs: this.getClockOffset(),
        tabId: this.tabId,
        elapsedMs: performance.now(),
      },
      sequence: ++this.sequence,
      label: label.slice(0, 160),
      method,
      round: view?.study?.market.round ?? view?.round ?? 0,
      version: view?.version ?? 0,
      ...(view?.study
        ? {
            market: view.study.market.id,
            stage: view.study.market.stage,
            periodStartedAt: view.study.market.periodStartedAt,
          }
        : {}),
      ...(commandType ? { commandType } : {}),
      phase: "activation",
    };
    const activation = { event, element, claimed: false, finished: false };
    this.current = activation;
    this.emit(event);
    return activation;
  }
  private result(
    activation: Activation,
    detail: Pick<
      ClientAction,
      "status" | "result" | "errorCode" | "reason" | "respondedAt"
    >,
  ) {
    activation.finished = true;
    this.emit({
      ...activation.event,
      ...detail,
      id: crypto.randomUUID(),
      sequence: ++this.sequence,
      phase: "result",
    });
  }
  block(errorCode: string, reason: string) {
    const current = this.current;
    if (current && !current.finished)
      this.result(current, {
        status: "blocked",
        errorCode,
        reason: reason.slice(0, 240),
      });
  }
  startCommand(command: Command, requestId: string) {
    let current = this.current;
    if (
      !current ||
      current.finished ||
      current.claimed ||
      Date.now() - current.event.interaction.clickedAt > 1000
    )
      current = this.begin(
        commandButtons[command.type] ?? command.type,
        command.type,
        "programmatic",
        command.type,
      );
    current.claimed = true;
    current.event = { ...current.event, commandType: command.type, requestId };
    this.pendingCommands++;
    return current;
  }
  finishCommand(
    activation: Activation,
    status: "acknowledged" | "rejected" | "unconfirmed",
    errorCode?: string,
    reason?: string,
  ) {
    this.pendingCommands = Math.max(0, this.pendingCommands - 1);
    this.result(activation, {
      status,
      respondedAt: Date.now(),
      ...(status === "acknowledged"
        ? { result: "server_acknowledged" }
        : { errorCode, reason: reason?.slice(0, 240) }),
    });
    if (status === "unconfirmed" && activation.event.requestId)
      this.reconcile(activation, 0);
  }
  blockCommand(activation: Activation, errorCode: string, reason: string) {
    this.pendingCommands = Math.max(0, this.pendingCommands - 1);
    this.result(activation, { status: "blocked", errorCode, reason });
  }
  private reconcile(activation: Activation, attempt: number) {
    const requestId = activation.event.requestId!;
    if (this.disposed || attempt >= 3) return;
    const timer = setTimeout(async () => {
      this.reconciliations.delete(requestId);
      if (!navigator.onLine) return;
      try {
        const response = await fetch(
          `${roomApiHref(this.code, "student", "/actions")}&requestId=${requestId}`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) },
        );
        if (response.ok) {
          const { operation } = (await response.json()) as {
            operation: Operation | null;
          };
          if (operation) {
            this.result(activation, {
              status:
                operation.status === "success" ? "acknowledged" : "rejected",
              ...(operation.status === "success"
                ? { result: operation.result?.code }
                : { errorCode: operation.errorCode, reason: operation.reason }),
            });
            return;
          }
        }
      } catch {
        /* The export also reconciles these IDs with durable server events. */
      }
      this.reconcile(activation, attempt + 1);
    }, [1500, 5000, 15000][attempt]);
    this.reconciliations.set(requestId, timer);
  }
  private capture = (event: MouseEvent | PointerEvent | SubmitEvent) => {
    const target = event.target instanceof Element ? event.target : undefined;
    const submitter =
      event instanceof SubmitEvent ? event.submitter : undefined;
    const element = (submitter ??
      target?.closest(
        "button, [role='button'], input[type='submit'], a.button",
      )) as HTMLElement | null | undefined;
    const form =
      event instanceof SubmitEvent
        ? (event.target as HTMLFormElement)
        : element?.closest("form");
    if (!element && !(event instanceof SubmitEvent)) return;
    const disabled =
      element?.matches(":disabled, [aria-disabled='true']") ?? false;
    if (event.type === "pointerdown" && !disabled) return;
    if (event.type === "click" && disabled) return;
    const current = this.current;
    if (
      event.type === "submit" &&
      current &&
      current.element === element &&
      !current.finished
    )
      return;
    const label = (
      element?.getAttribute("aria-label") ||
      element?.textContent ||
      "フォーム送信"
    )
      .replace(/\s+/g, " ")
      .trim();
    const commandType =
      element?.dataset.auditCommand ?? form?.dataset.auditCommand;
    const button =
      element?.dataset.auditButton ??
      form?.dataset.auditForm ??
      `button:${label}`.slice(0, 120);
    const activation = this.begin(
      button,
      label,
      !event.isTrusted
        ? "programmatic"
        : event.type === "submit" || (event as MouseEvent).detail === 0
          ? "keyboard"
          : "pointer",
      commandType,
      element ?? undefined,
    );
    if (disabled) {
      this.block("BUTTON_DISABLED", "このボタンは現在利用できません。");
      return;
    }
    setTimeout(() => {
      if (!activation.claimed && !activation.finished) {
        if (commandType)
          this.result(activation, {
            status: "blocked",
            errorCode: "CLIENT_NOT_SUBMITTED",
            reason: "入力確認または画面の状態により送信されませんでした。",
          });
        else
          this.result(activation, {
            status: "local_success",
            result: "button_activated",
          });
      }
    }, 0);
  };
  private schedule() {
    if (this.disposed) return;
    this.timer = setTimeout(
      () => {
        void this.flush().finally(() => this.schedule());
      },
      6000 + Math.random() * 4000,
    );
  }
  async flush(keepalive = false) {
    if (
      this.uploading ||
      !navigator.onLine ||
      (!keepalive && this.pendingCommands > 0)
    )
      return;
    this.uploading = true;
    try {
      const batch = await this.queue.batch(this.owner);
      if (!batch.length) return;
      const response = await fetch(
        roomApiHref(this.code, "student", "/actions"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId: this.actor, entries: batch }),
          keepalive,
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) return;
      const result = (await response.json()) as { saved: string[] };
      const submitted = new Set(batch.map((entry) => entry.id));
      await this.queue.acknowledge(
        result.saved.filter((id) => submitted.has(id)),
      );
    } catch {
      /* Keep pending records for the next batch/reload. */
    } finally {
      this.uploading = false;
    }
  }
  attach() {
    const block = (code: string, reason: string) => this.block(code, reason);
    blockCurrent = block;
    const click = (event: Event) =>
      this.capture(event as MouseEvent | PointerEvent | SubmitEvent);
    for (const type of ["click", "pointerdown", "submit"]) {
      document.addEventListener(type, click, true);
      this.cleanups.push(() => document.removeEventListener(type, click, true));
    }
    const hidden = () => {
      // Navigation can occur while a batch is awaiting its acknowledgement.
      if (document.visibilityState === "hidden") void this.flush(true);
    };
    const invalid = (event: Event) => {
      const field = event.target;
      if (
        !(field instanceof HTMLInputElement) ||
        !field.form?.dataset.auditCommand
      )
        return;
      if (!this.current || this.current.finished)
        this.begin(
          field.form.dataset.auditForm ?? "form.submit",
          "フォーム送信",
          "keyboard",
          field.form.dataset.auditCommand,
        );
      this.block(
        field.type === "number" ? "INVALID_PRICE" : "CLIENT_VALIDATION",
        field.validationMessage || "入力内容を確認してください。",
      );
    };
    document.addEventListener("invalid", invalid, true);
    this.cleanups.push(() =>
      document.removeEventListener("invalid", invalid, true),
    );
    const online = () => {
      void this.flush();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", online);
    this.cleanups.push(
      () => document.removeEventListener("visibilitychange", hidden),
      () => window.removeEventListener("online", online),
    );
    this.schedule();
    return () => {
      this.disposed = true;
      clearTimeout(this.timer);
      for (const timer of this.reconciliations.values()) clearTimeout(timer);
      for (const cleanup of this.cleanups) cleanup();
      if (blockCurrent === block) blockCurrent = undefined;
      void this.flush(true).finally(() => this.queue.close());
    };
  }
}
