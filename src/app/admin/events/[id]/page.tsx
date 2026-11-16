import { notFound } from "next/navigation";
import { EventsAdmin } from "@/components/admin/events/EventsAdmin";

export default async function EventAdminPage({ params }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <EventsAdmin id={id} />;
}
