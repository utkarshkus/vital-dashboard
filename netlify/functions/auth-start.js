// netlify/functions/auth-start.js  (Netlify Functions v2)
import crypto from 'crypto';
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const clientId    = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new Response(
      JSON.stringify({ error: 'WHOOP_CLIENT_ID or WHOOP_REDIRECT_URI env var not set.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const state = crypto.randomBytes(16).toString('hex');

  try {
    const store = getStore({ name: 'vital-auth', consistency: 'strong' });
    await store.set('oauth-state', state, { ttl: 600 });
  } catch (err) {
    console.error('Blobs set failed:', err.message);
    return new Response(
      JSON.stringify({ error: 'Could not initialise auth session.', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const scopes = 'read:recovery read:sleep read:profile read:body_measurement';
  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
};

export const config = { path: '/api/auth-start' };
