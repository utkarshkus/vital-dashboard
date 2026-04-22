// netlify/functions/config-get.js
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('vital-config');
    const raw   = await store.get('user-config');
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: raw || '{}' };
  } catch (err) {
    console.warn('Blobs unavailable:', err.message);
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Blobs unavailable' }) };
  }
};
