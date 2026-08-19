import { MemoryGraph } from "@/components/memory/memory-graph";
import { listCustomMemoryFiles } from "@/lib/memory-files";

export const metadata = {
  title: "Memory · fonzi-signal",
  description: "Explore the knowledge that shapes Fonzi's content operating system.",
};

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const customFiles = await listCustomMemoryFiles();
  return <MemoryGraph customFiles={customFiles} />;
}
