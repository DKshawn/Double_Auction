"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, CommandRequest, RoomView } from "@/lib/types";
import { applyPatch, type RoomPatch } from "@/lib/room-sync";
import { goodName } from "@/lib/catalog";
import { api, ApiError, errorMessage } from "@/lib/client";

export function useRoom(code: string) {
  const [view, setView] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    round: number;
    message: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const lastSuccess = useRef(0);
  const refresh = useRef<() => void>(() => {});
  const busy = useRef(false);

  const acceptView = useCallback((next: RoomView) => {
    offset.current = next.serverTime - Date.now();
    lastSuccess.current = Date.now();
    setNow(next.serverTime);
    setView((old) =>
      old && old.code === next.code && old.version > next.version ? old : next,
    );
    setConnected(true);
    setAuthError("");
    setConnectionError("");
  }, []);

  useEffect(() => {
    let disposed = false;
    let stream: EventSource | undefined;
    let wireView: RoomView | null = null;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    let lastFetch = 0;
    let authFailed = false;
    const controller = new AbortController();
    const healthy = (serverTime: number) => {
      lastSuccess.current = Date.now();
      offset.current = serverTime - Date.now();
      setNow(serverTime);
      setConnected(true);
      setConnectionError("");
      clearTimeout(fallback);
    };
    async function snapshot() {
      if (inflight || disposed) return;
      inflight = true;
      lastFetch = Date.now();
      try {
        const next = await api<RoomView>(
          `/api/rooms/${code}`,
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
        if (!disposed) acceptView(next);
      } catch (e) {
        if (!disposed) {
          setConnected(false);
          setConnectionError(
            "サーバーに接続できません。通信状況を確認して再接続してください。",
          );
          if (e instanceof ApiError && [401, 404].includes(e.status)) {
            authFailed = true;
            clearTimeout(fallback);
            setAuthError(e.message);
            stream?.close();
          }
        }
      } finally {
        inflight = false;
      }
    }
    function retrySnapshot() {
      clearTimeout(fallback);
      if (authFailed || disposed) return;
      fallback = setTimeout(
        async () => {
          await snapshot();
          if (!disposed && stream?.readyState !== EventSource.OPEN)
            retrySnapshot();
        },
        Math.max(1000, 5000 - (Date.now() - lastFetch)),
      );
    }
    function connect() {
      if (disposed) return;
      stream?.close();
      wireView = null;
      stream = new EventSource(`/api/rooms/${code}/events`);
      stream.addEventListener("snapshot", (event: MessageEvent<string>) => {
        if (disposed) return;
        try {
          wireView = JSON.parse(event.data) as RoomView;
          acceptView(wireView);
          clearTimeout(fallback);
        } catch {
          connect();
        }
      });
      stream.addEventListener("patch", (event: MessageEvent<string>) => {
        if (disposed) return;
        try {
          if (!wireView) throw new Error("Snapshot required");
          wireView = applyPatch(wireView, JSON.parse(event.data) as RoomPatch);
          acceptView(wireView);
          clearTimeout(fallback);
        } catch {
          connect();
        }
      });
      stream.addEventListener("heartbeat", (event: MessageEvent<string>) => {
        if (!disposed)
          healthy(
            (JSON.parse(event.data) as { serverTime: number }).serverTime,
          );
      });
      stream.addEventListener(
        "session-error",
        (event: MessageEvent<string>) => {
          if (disposed) return;
          const error = JSON.parse(event.data) as {
            status: number;
            message: string;
          };
          setConnected(false);
          setConnectionError(error.message);
          if ([401, 404].includes(error.status)) {
            authFailed = true;
            clearTimeout(fallback);
            setAuthError(error.message);
            stream?.close();
          } else retrySnapshot();
        },
      );
      stream.onerror = () => {
        if (disposed) return;
        setConnected(false);
        setConnectionError(
          "再接続しています。接続が戻るまで注文は送信できません。",
        );
        retrySnapshot();
      };
    }
    refresh.current = () => {
      authFailed = false;
      void snapshot();
      connect();
    };
    const wake = () => {
      if (
        !document.hidden &&
        (stream?.readyState !== EventSource.OPEN ||
          Date.now() - lastSuccess.current > 15_000)
      ) {
        void snapshot();
        connect();
      }
    };
    void snapshot();
    connect();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    const tick = setInterval(() => {
      setNow(Date.now() + offset.current);
      if (lastSuccess.current && Date.now() - lastSuccess.current > 15_000) {
        setConnected(false);
        if (stream?.readyState === EventSource.OPEN) {
          retrySnapshot();
          connect();
        }
      }
    }, 250);
    return () => {
      disposed = true;
      controller.abort();
      stream?.close();
      clearTimeout(fallback);
      clearInterval(tick);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [code, acceptView]);

  async function command(command: Command) {
    if (!view || busy.current || !connected) return false;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice(null);
    const request: CommandRequest = {
      requestId: crypto.randomUUID(),
      expectedRound: view.round,
      expectedStage: view.study?.market.stageKey,
      command,
    };
    try {
      let next: RoomView | undefined;
      // Lost HTTP responses are safe to retry using the same command ID.
      for (let i = 0; i < 2; i++) {
        try {
          next = await api<RoomView>(
            `/api/rooms/${code}/commands`,
            request,
            AbortSignal.timeout(15_000),
          );
          break;
        } catch (e) {
          if (e instanceof ApiError || i === 1) throw e;
        }
      }
      acceptView(next!);
      const newTrade = next!.trades.find(
        (t) =>
          !view.trades.some((old) => old.id === t.id) &&
          (t.buyerId === view.me.id || t.sellerId === view.me.id),
      );
      setNotice({
        round: next!.round,
        message: newTrade
          ? `${goodName(newTrade.good)}を ${newTrade.price} 円で取引しました。`
          : command.type === "study-randomize"
            ? "学生の市場と買い手・売り手をランダムに割り当てました。"
            : command.type === "quote"
              ? "注文を受け付けました。"
              : command.type === "cancel"
                ? "注文を取り消しました。"
                : command.type === "update-markets"
                  ? "価値と費用を保存しました。入室済みの学生にも反映されます。"
                  : "実験の状態を更新しました。",
      });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      refresh.current();
      return false;
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  return {
    view,
    connected,
    connectionError,
    authError,
    error,
    notice: notice?.round === view?.round ? notice?.message : "",
    pending,
    now,
    command,
    retry: () => refresh.current(),
  };
}
