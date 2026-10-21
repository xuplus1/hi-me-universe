import ArchiveClient from "./archive-client";
import { hasArchiveSession } from "./archive-auth";
import OwnerLogin from "./owner-login";

export const dynamic = "force-dynamic";

export default async function Home() {
  return (await hasArchiveSession())
    ? <ArchiveClient mode="cloud" />
    : <OwnerLogin />;
}
