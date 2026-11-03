"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";
import { ExperimentCards } from "./experiment-cards";

export function TeacherHub({ status }: { status: ServerStatus }) {
  const router = useRouter();
  return (
    <>
      <div className="teacher-rooms-heading">
        <h1>実験を選ぶ</h1>
        <Link className="button secondary small-button" href="/teacher?code=">
          教員として再入室
        </Link>
      </div>
      <ExperimentCards mode="teacher" />
      <TeacherRooms
        status={status}
        onEnter={(code) => router.push(`/teacher?code=${code}`)}
      />
    </>
  );
}
