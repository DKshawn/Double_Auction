import { notFound } from "next/navigation";
import { Room } from "@/components/room";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ entry?: string }>;
}) {
  const { code } = await params;
  if (!/^[A-Za-z2-9]{6}$/.test(code)) notFound();
  const { entry } = await searchParams;
  return (
    <Room
      key={`${code.toUpperCase()}-${entry === "teacher" ? "teacher" : "student"}`}
      code={code.toUpperCase()}
      entry={entry}
    />
  );
}
