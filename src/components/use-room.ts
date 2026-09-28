"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, CommandRequest, RoomView } from "@/lib/types";
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
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let inflight = false;
    const controller = new AbortController();
    async function poll() {
      if (inflight || disposed) return;
      inflight = true;
      clearTimeout(timer);
      try {
        const next = await api<RoomView>(
          `/api/rooms/${code}`,
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        );
        if (!disposed) {
          acceptView(next);
          failures = 0;
        }
      } catch (e) {
        if (!disposed) {
          failures++;
          setConnected(false);
          setConnectionError(
            "サーバーに接続できません。通信状況を確認して再接続してください。",
          );
          if (e instanceof ApiError && [401, 404].includes(e.status))
            setAuthError(e.message);
        }
      } finally {
        inflight = false;
        if (!disposed)
          timer = setTimeout(
            poll,
            failures
              ? Math.min(8000, 1000 * 2 ** failures)
              : document.hidden
                ? 3000
                : 1000,
          );
      }
    }
    refresh.current = () => {
      void poll();
    };
    const wake = () => {
      if (!document.hidden) void poll();
    };
    void poll();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    const tick = setInterval(() => {
      setNow(Date.now() + offset.current);
      if (lastSuccess.current && Date.now() - lastSuccess.current > 5000)
        setConnected(false);
    }, 250);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
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
