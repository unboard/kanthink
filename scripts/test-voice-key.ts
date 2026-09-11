import { db } from '../lib/db';

/**
 * What each account can actually call.
 *
 * Kept as a diagnostic for the question that keeps coming up — "why is voice off
 * for this user" — which is now answered per provider rather than per account:
 * live voice needs a Google key specifically, and having an OpenAI one says
 * nothing either way.
 */
async function main() {
  const allUsers = await db.query.users.findMany({ columns: { id: true, email: true, name: true } });
  console.log('Users:', allUsers.map(u => `${u.name} (${u.email})`));

  const { resolveProviderKeys, userOwnedProviders } = await import('../lib/ai/keys');
  const { getModelPreferences } = await import('../lib/ai/modelPreferences');

  for (const user of allUsers) {
    const [resolved, owned, preferences] = await Promise.all([
      resolveProviderKeys(user.id),
      userOwnedProviders(user.id),
      getModelPreferences(user.id),
    ]);

    console.log(`\n${user.name} <${user.email}>`);
    console.log('  own keys:      ', owned.join(', ') || 'none');
    console.log('  callable:      ', Object.entries(resolved.keys)
      .map(([provider, key]) => `${provider} (${key.source})`)
      .join(', ') || 'none');
    console.log('  live voice:    ', resolved.keys.google ? 'available' : 'needs a Google key');
    console.log('  default model: ', preferences.default ?? 'not set');
    const overrides = Object.entries(preferences.overrides);
    if (overrides.length > 0) {
      console.log('  overrides:     ', overrides.map(([k, v]) => `${k} → ${v}`).join(', '));
    }
    if (resolved.error) console.log('  error:         ', resolved.error);
  }
}

main().catch(console.error).finally(() => process.exit(0));
