// Minimal duck-type so this works with any Supabase client (server, client, admin)
interface SupabaseLike {
  from(table: string): any;
}

export async function logApplicationEvent(
  supabase: SupabaseLike,
  applicationId: string,
  userId: string,
  eventType: string,
  description: string,
  eventData?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('application_events').insert({
      application_id: applicationId,
      user_id:        userId,
      event_type:     eventType,
      description,
      event_data:     eventData ?? null,
    });
  } catch (err) {
    console.error('[applicationEvents] log error:', err);
  }
}
