import { equilibrium } from "./equilibrium";
import { staircasePoints } from "./study-generator";

/** A linear viewport centered on the midpoint of the original equilibrium range. */
export function studyChartViewport(
  demand: number[],
  supply: number[],
  requestedZoom = 1,
) {
  const eq = equilibrium(demand, supply);
  const count = Math.max(demand.length, supply.length);
  const quantityCenter = (eq.quantity + eq.quantityMax) / 2;
  const priceCenter = (eq.low + eq.high) / 2;
  const quantityRadius = Math.max(
    2,
    (eq.quantityMax - eq.quantity) / 2 + 1,
    Math.min(quantityCenter, count - quantityCenter),
  );
  const vertices = [...staircasePoints(demand), ...staircasePoints(supply)];
  const visiblePrices = vertices
    .filter(([q]) => Math.abs(q - quantityCenter) <= quantityRadius)
    .map(([, price]) => price);
  const radius = (prices: number[]) =>
    Math.max(4, ...prices.map((price) => Math.abs(price - priceCenter))) * 1.12;
  const priceRadius = radius([...visiblePrices, eq.low, eq.high]);
  const fullQuantityRadius =
    Math.max(2, quantityCenter, count - quantityCenter) * 1.05;
  const fullPriceRadius = radius([...demand, ...supply]);
  const minZoom = Math.min(
    1,
    quantityRadius / fullQuantityRadius,
    priceRadius / fullPriceRadius,
  );
  const zoom = Math.max(minZoom, Math.min(8, requestedZoom));
  return {
    eq,
    count,
    quantityCenter,
    priceCenter,
    minZoom,
    zoom,
    quantityMin: quantityCenter - quantityRadius / zoom,
    quantityMax: quantityCenter + quantityRadius / zoom,
    priceMin: priceCenter - priceRadius / zoom,
    priceMax: priceCenter + priceRadius / zoom,
  };
}

export function studyChartTicks(min: number, max: number) {
  if (max <= min) return [];
  const rough = (max - min) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rough)!;
  const step = Math.max(1, multiple * magnitude);
  const first = Math.ceil(min / step) * step;
  const length = Math.max(0, Math.floor((max - first) / step) + 1);
  return Array.from({ length }, (_, i) =>
    Number((first + step * i).toFixed(6)),
  );
}
