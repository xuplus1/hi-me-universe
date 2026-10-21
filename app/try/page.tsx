import type { Metadata } from "next";
import ArchiveClient from "../archive-client";

export const metadata: Metadata = {
  title: "Hi！Me · 创建我的空宇宙",
  description: "无需账号，在这台设备上开始一份自己的书影音档案。",
};

export default function TryHiMe() {
  return <ArchiveClient mode="guest" />;
}
