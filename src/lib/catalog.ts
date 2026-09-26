// Public product metadata only. Private schedules live in server/experiment.ts.
export const GOODS = [
  {
    id: "apple",
    name: "りんご",
    image: "/fruits/apple.jpg",
    color: "#da5c52",
    tint: "#fff0ec",
  },
  {
    id: "banana",
    name: "バナナ",
    image: "/fruits/banana.jpg",
    color: "#c29316",
    tint: "#fff9e5",
  },
  {
    id: "orange",
    name: "みかん",
    image: "/fruits/orange.jpg",
    color: "#e58b35",
    tint: "#fff2e3",
  },
] as const;

export type GoodId = (typeof GOODS)[number]["id"];
export const goodName = (id: GoodId) => GOODS.find((g) => g.id === id)!.name;
