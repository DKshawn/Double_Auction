"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Laptop } from "lucide-react";
import styles from "./demo-preview.module.css";

const PRESETS = [
  { screen: "1366 × 768", width: 1366, height: 768, scaling: 100 },
  { screen: "1920 × 1080", width: 1536, height: 864, scaling: 125 },
  { screen: "1920 × 1080", width: 1280, height: 720, scaling: 150 },
  { screen: "1920 × 1080", width: 1920, height: 1080, scaling: 100 },
] as const;

export function DemoPreview() {
  const [selected, setSelected] = useState(1);
  const [reserveChrome, setReserveChrome] = useState(true);
  const [fit, setFit] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const preset = PRESETS[selected];
  const height = preset.height - (reserveChrome ? 120 : 0);
  const scale =
    fit && available.width > 0 && available.height > 0
      ? Math.min(1, available.width / preset.width, available.height / height)
      : 1;

  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setAvailable((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.toolbar}>
        <div className={styles.heading}>
          <div>
            <h1>
              <Laptop size={22} aria-hidden="true" />
              画面サイズ別デモ
            </h1>
            <p>
              枠内でそのまま取引できます。サイズを切り替えても進行状況は保持されます。
            </p>
          </div>
          <Link
            href="/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary small-button"
          >
            通常のデモを開く <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.controls}>
          <div
            className={styles.presets}
            role="group"
            aria-label="画面サイズと表示倍率"
          >
            {PRESETS.map((item, index) => (
              <button
                key={`${item.screen}-${item.scaling}`}
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                <b>{item.screen}</b>
                <span>表示倍率 {item.scaling}%</span>
              </button>
            ))}
          </div>
          <label className={styles.display}>
            プレビュー表示
            <select
              value={fit ? "fit" : "actual"}
              onChange={(e) => setFit(e.target.value === "fit")}
            >
              <option value="fit">全体に合わせる</option>
              <option value="actual">原寸（100%）</option>
            </select>
          </label>
        </div>
        <div className={styles.info}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={reserveChrome}
              onChange={(e) => setReserveChrome(e.target.checked)}
            />
            ブラウザー・タスクバー用に高さ120pxを差し引く（目安）
          </label>
          <output aria-live="polite">
            デモの表示領域{" "}
            <b>
              {preset.width} × {height} px
            </b>
            <span>プレビュー {Math.round(scale * 100)}%</span>
          </output>
        </div>
        <p className={styles.help}>
          表示倍率はOS側、ブラウザーのズームは100%を想定。枠全体を縮小してもデモ内の表示領域は変わりません。文字の大きさは「原寸」で確認できます。
        </p>
      </header>
      <div className={styles.stage} ref={stage}>
        {!loaded && (
          <p className={styles.loading} role="status">
            デモを読み込み中…
          </p>
        )}
        <div
          className={styles.frameBox}
          style={{ width: preset.width * scale, height: height * scale }}
        >
          <iframe
            className={styles.frame}
            title="操作できるひとりデモ"
            src="/demo"
            width={preset.width}
            height={height}
            style={{ transform: `scale(${scale})` }}
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>
    </main>
  );
}
