export function estimateAttendanceDurationSeconds({
  joinedAt,
  joined_at,
  leftAt,
  left_at,
  lastSeenAt,
  last_seen_at,
  now = new Date()
}: {
  joinedAt?: string | Date | null;
  joined_at?: string | Date | null;
  leftAt?: string | Date | null;
  left_at?: string | Date | null;
  lastSeenAt?: string | Date | null;
  last_seen_at?: string | Date | null;
  now?: Date;
}) {
  const joinedValue = joinedAt ?? joined_at;
  if (!joinedValue) return 0;

  const start = new Date(joinedValue).getTime();
  const endSource = leftAt ?? left_at ?? lastSeenAt ?? last_seen_at ?? now;
  const end = new Date(endSource).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  return Math.floor((end - start) / 1000);
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
