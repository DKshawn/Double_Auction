"use client";
import { JUDGMENT_NAME } from "@/experiments/judgment/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeacherRooms } from "./teacher-rooms";
import type { ServerStatus } from "@/lib/server/config";

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
      <div className="experiment-grid">
        <Link
          className="experiment-card"
          href="/teacher?experiment=institutions"
        >
          <h2>Double Auction</h2>
          <p>商品を取引し、市場制度と価格形成を比較する。</p>
          <span>CDA / Call Market / Posted Offer</span>
        </Link>
        <Link className="experiment-card" href="/teacher?experiment=emh">
          <h2>Efficient Market Hypothesis</h2>
          <p>配当の異なる証券を取引し、情報と資産価格の関係を観察する。</p>
          <span>資産市場実験</span>
        </Link>
        <Link className="experiment-card" href="/teacher?experiment=judgment">
          <h2>{JUDGMENT_NAME}</h2>
          <p>確率判断や意思決定を通して、認知の偏りを観察する。</p>
        </Link>
      </div>
      <TeacherRooms
        status={status}
        onEnter={(code) => router.push(`/teacher?code=${code}`)}
      />
    </>
  );
}
