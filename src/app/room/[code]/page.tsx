import { notFound } from "next/navigation";
import { Room } from "@/components/room";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[A-Za-z2-9]{6}$/.test(code)) notFound();
  return <Room key={code.toUpperCase()} code={code.toUpperCase()} />;
}
