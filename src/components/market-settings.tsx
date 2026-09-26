"use client";

import Image from "next/image";
import { useState } from "react";
import { LockKeyhole, Save, SlidersHorizontal } from "lucide-react";
import { GOODS, type GoodId } from "@/lib/catalog";
import { equilibrium, equilibriumQuantity } from "@/lib/equilibrium";
import type { Command, MarketSettings, RoomView } from "@/lib/types";

type Draft = Record<GoodId, { values: string[]; costs: string[] }>;
const validPoint = (value: string) =>
  value.trim() !== "" &&
  Number.isInteger(Number(value)) &&
  Number(value) >= 1 &&
  Number(value) <= 999;

function readDraft(draft: Draft): MarketSettings | null {
  if (
    GOODS.some(({ id }) =>
      [...draft[id].values, ...draft[id].costs].some(
        (value) => !validPoint(value),
      ),
    )
  )
    return null;
  return Object.fromEntries(
    GOODS.map(({ id }) => [
      id,
      {
        values: draft[id].values.map(Number),
        costs: draft[id].costs.map(Number),
      },
    ]),
  ) as MarketSettings;
}

function ProductHeading({ good }: { good: (typeof GOODS)[number] }) {
  return (
    <div className="settings-product-heading">
      <Image src={good.image} alt="" width={42} height={42} />
      <h3>{good.name}</h3>
    </div>
  );
}

function EquilibriumPreview({
  settings,
  capacity,
  name,
}: {
  settings: MarketSettings[GoodId];
  capacity: number;
  name: string;
}) {
  const eq = equilibrium(settings.values, settings.costs);
  const scaled = {
    ...eq,
    quantity: eq.quantity * (capacity / 12),
    quantityMax: eq.quantityMax * (capacity / 12),
  };
  return (
    <output className="settings-preview" aria-label={`${name}の均衡プレビュー`}>
      <span>
        均衡価格 <b>{eq.low === eq.high ? eq.low : `${eq.low}〜${eq.high}`}</b>{" "}
        ポイント
      </span>
      <span>
        均衡数量 <b>{equilibriumQuantity(scaled)}</b> 単位
      </span>
      {eq.surplus === 0 && (
        <small>この条件では正の取引利益が生まれません。</small>
      )}
    </output>
  );
}

function MarketSettingsEditor({
  teacher,
  capacity,
  disabled,
  command,
  onDone,
}: {
  teacher: NonNullable<RoomView["teacher"]>;
  capacity: number;
  disabled: boolean;
  command: (command: Command) => Promise<boolean>;
  onDone: () => void;
}) {
  const [revision] = useState(teacher.settingsRevision);
  const [draft, setDraft] = useState<Draft>(
    () =>
      Object.fromEntries(
        GOODS.map(({ id }) => [
          id,
          {
            values: teacher.marketSettings[id].values.map(String),
            costs: teacher.marketSettings[id].costs.map(String),
          },
        ]),
      ) as Draft,
  );
  const [error, setError] = useState("");
  const settings = readDraft(draft);
  const stale = revision !== teacher.settingsRevision;

  function change(
    id: GoodId,
    side: "values" | "costs",
    index: number,
    value: string,
  ) {
    setDraft((old) => ({
      ...old,
      [id]: {
        ...old[id],
        [side]: old[id][side].map((current, i) =>
          i === index ? value : current,
        ),
      },
    }));
    setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || stale) return;
    if (!settings) {
      setError("すべての価値と費用を、1〜999の整数で入力してください。");
      return;
    }
    setError("");
    if (
      await command({
        type: "update-markets",
        settings,
        expectedRevision: revision,
      })
    )
      onDone();
    else
      setError(
        "保存できませんでした。接続状況と画面上部のメッセージを確認してください。",
      );
  }

  return (
    <form onSubmit={save} noValidate>
      <fieldset className="settings-fields" disabled={disabled || stale}>
        <legend className="sr-only">各商品の価値と費用</legend>
        <div className="market-settings-grid">
          {GOODS.map((good) => (
            <div className="market-settings-card" key={good.id}>
              <ProductHeading good={good} />
              <div className="settings-input-headings" aria-hidden="true">
                <span>条件</span>
                <span>買い手の価値</span>
                <span>売り手の費用</span>
              </div>
              {Array.from({ length: 6 }, (_, index) => (
                <div className="settings-input-row" key={index}>
                  <span aria-hidden="true">{index + 1}</span>
                  {(["values", "costs"] as const).map((side) => (
                    <input
                      key={side}
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      inputMode="numeric"
                      aria-label={`${good.name} ${side === "values" ? "買い手の価値" : "売り手の費用"} ${index + 1}`}
                      aria-invalid={
                        Boolean(error) &&
                        !validPoint(draft[good.id][side][index])
                      }
                      value={draft[good.id][side][index]}
                      onChange={(event) =>
                        change(good.id, side, index, event.target.value)
                      }
                    />
                  ))}
                </div>
              ))}
              {settings && (
                <EquilibriumPreview
                  settings={settings[good.id]}
                  capacity={capacity}
                  name={good.name}
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>
      {stale && (
        <p className="error-message" role="alert">
          別の画面で設定が更新されました。キャンセルして最新の設定を開き直してください。
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="settings-form-actions">
        <p>保存すると入室済みの学生にも反映されます。</p>
        <div>
          <button
            className="button secondary"
            type="button"
            onClick={onDone}
            disabled={disabled}
          >
            キャンセル
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={disabled || stale}
          >
            <Save size={15} />
            価値と費用を保存
          </button>
        </div>
      </div>
    </form>
  );
}

export function MarketSettingsPanel({
  view,
  command,
  disabled,
  editing,
  onEditingChange,
}: {
  view: RoomView;
  command: (command: Command) => Promise<boolean>;
  disabled: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const teacher = view.teacher!;
  const editable = view.phase === "waiting" && view.round === 0;
  return (
    <section
      className="panel market-settings-panel"
      aria-labelledby="market-settings-heading"
    >
      <div className="panel-heading">
        <h2 id="market-settings-heading">
          <SlidersHorizontal size={18} />
          価値・費用の設定
        </h2>
        {editable ? (
          !editing && (
            <button
              className="button secondary small-button"
              disabled={disabled}
              onClick={() => onEditingChange(true)}
            >
              設定を変更
            </button>
          )
        ) : (
          <span className="settings-locked">
            <LockKeyhole size={14} />
            実験開始後は変更できません
          </span>
        )}
      </div>
      <div className="settings-content">
        <p className="settings-help">
          各商品に6組の条件を設定します。{view.config.capacity}
          人の実験では、各条件を買い手・売り手にそれぞれ
          {view.config.capacity / 12}
          人ずつランダムに割り当てます。値は1〜999の整数（ポイント）です。実験開始後は全ラウンドを通して固定されます。
        </p>
        {editing && editable ? (
          <MarketSettingsEditor
            teacher={teacher}
            capacity={view.config.capacity}
            command={command}
            disabled={disabled}
            onDone={() => onEditingChange(false)}
          />
        ) : (
          <div className="market-settings-grid">
            {GOODS.map((good) => (
              <div className="market-settings-card" key={good.id}>
                <ProductHeading good={good} />
                <dl className="settings-values">
                  <div>
                    <dt>買い手の価値</dt>
                    <dd>
                      {teacher.marketSettings[good.id].values.join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>売り手の費用</dt>
                    <dd>{teacher.marketSettings[good.id].costs.join(" · ")}</dd>
                  </div>
                </dl>
                <EquilibriumPreview
                  settings={teacher.marketSettings[good.id]}
                  capacity={view.config.capacity}
                  name={good.name}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
