import { redirect } from "next/navigation";

// The develop page lives at /ideas/[id]. This route exists so /items/<id>
// links (the canonical spine object) land in the right place.
export default async function ItemRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/ideas/${id}`);
}
