"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import type { RoomConfig } from "@/lib/types";
import type { StudyGeneratorConfig } from "@/lib/study-types";
import { DEMO_SETTINGS } from "@/lib/demo";
import { Header, Footer } from "./shell";
import { TeacherForm } from "./teacher-form";

const DemoRoom = dynamic(() => import("./demo-room"), {
  ssr: false,
  loading: () => (
    <main className="narrow-main">
      <p role="status">ひとりデモを準備しています…</p>
    </main>
  ),
});

export function DemoEntry() {
  const [config, setConfig] = useState<RoomConfig>();
  const [generator, setGenerator] = useState<StudyGeneratorConfig>();
  const [running, setRunning] = useState(false);
  if (running && config)
    return (
      <DemoRoom
        config={config}
        generator={generator}
        onConfigure={(updated, updatedGenerator) => {
          setConfig(updated);
          setGenerator(updatedGenerator);
          setRunning(false);
        }}
      />
    );
  return (
    <>
      <Header>
        <span className="demo-header-tag">ひとりデモ</span>
      </Header>
      <main className="narrow-main">
        <Link className="back-link" href="/teacher">
          <ArrowLeft size={15} />
          教員用ページへ
        </Link>
        <div className="page-intro">
          <span className="eyebrow">
            <GraduationCap size={18} />
            ひとりデモ · 教員の実験設定
          </span>
          <h1>実験の設定から、ひとりで確認。</h1>
          <p>制度・期数・人数・時間を設定して、教員画面から実験を進めます。</p>
        </div>
        <TeacherForm
          status={{ mode: "local", ready: true, keyRequired: false }}
          initialConfig={config}
          initialGenerator={generator}
          conditionPreset={{
            label: "既存プリセット（練習用）",
            settings: DEMO_SETTINGS,
          }}
          onCreateDemo={(created, adoptedGenerator) => {
            setConfig(created);
            setGenerator(adoptedGenerator);
            setRunning(true);
          }}
        />
      </main>
      <Footer />
    </>
  );
}
