import type { OrderBookSide } from "@/lib/order-book";

export function OrderBookList({
  sides,
  minimumRows = 1,
  showParticipants = false,
  quantityLabel = "数量",
}: {
  sides: OrderBookSide[];
  minimumRows?: number;
  showParticipants?: boolean;
  quantityLabel?: string;
}) {
  return (
    <div className="study-book">
      {sides.map(({ side, label, rows }) => (
        <div key={side}>
          <h3 className={side === "buyer" ? "buy-text" : "sell-text"}>
            {label}
          </h3>
          <div
            className="study-book-rows"
            role="region"
            aria-label={`${label}一覧`}
          >
            <table>
              <thead>
                <tr>
                  <th>価格（円）</th>
                  <th>{quantityLabel}</th>
                  {showParticipants && <th>参加者</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.price}
                    className={row.ownQuantity ? "study-own-order" : undefined}
                  >
                    <td>
                      {row.price}
                      {row.ownQuantity > 0 && (
                        <span
                          className="study-own-order-tag"
                          title={`あなたの注文${row.ownQuantity}単位を含みます`}
                        >
                          あなた含む
                        </span>
                      )}
                    </td>
                    <td>{row.quantity}</td>
                    {showParticipants && <td>{row.aliases}</td>}
                  </tr>
                ))}
                {Array.from(
                  { length: Math.max(0, minimumRows - rows.length) },
                  (_, i) => (
                    <tr
                      key={`empty-${i}`}
                      className="study-book-placeholder"
                      aria-hidden="true"
                    >
                      <td>—</td>
                      <td>—</td>
                      {showParticipants && <td>—</td>}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {!rows.length && (
              <p className="study-empty">まだ注文はありません</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
