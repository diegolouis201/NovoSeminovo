import Link from "next/link";
import { redirect } from "next/navigation";
import type { Notification } from "@novoseminovo/shared-types";
import { auth } from "@/auth";
import { Button } from "@/components/Button";
import { fetchMyNotifications } from "@/lib/api";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.accessToken) redirect("/entrar");

  const notifications = await fetchMyNotifications(session.accessToken);
  const hasUnread = notifications.some((notification) => !notification.readAt);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold text-ink">Notificações</h1>
        {hasUnread && (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="ghost" className="text-xs">
              Marcar todas como lidas
            </Button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="mt-6 text-ink-muted">Nenhuma notificação por aqui ainda.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
    </main>
  );
}

function NotificationCard({ notification }: { notification: Notification }) {
  const isUnread = !notification.readAt;
  const markReadAction = markNotificationReadAction.bind(null, notification.id);

  return (
    <li
      className={`flex items-start justify-between gap-4 rounded-brand border p-4 ${
        isUnread ? "border-brand-blue bg-brand-blue/5" : "border-border bg-surface-raised"
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold text-ink">{notification.title}</p>
        <p className="mt-1 text-sm text-ink-muted">{notification.body}</p>
        {notification.link && (
          <Link
            href={notification.link}
            className="mt-2 inline-block text-xs font-semibold text-brand-blue hover:underline"
          >
            Ver mais
          </Link>
        )}
      </div>
      {isUnread && (
        <form action={markReadAction} className="shrink-0">
          <Button type="submit" variant="ghost" className="text-xs">
            Marcar como lida
          </Button>
        </form>
      )}
    </li>
  );
}
