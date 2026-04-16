// netlify/functions/config-get.js
// Reads server-side config from Netlify Blobs.
// Fields stored here: startWeight, currentWeight, targetWeight, stepTarget, manualSteps
//
// Netlify Blobs docs: https://docs.netlify.com/blobs/overview/
// getStore() is available in the Netlify Functions runtime automatically —
// no extra npm install needed when deployed on Netlify.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // getStore is injected by the Netlify Functions runtime
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vital-config');
    const raw = await store.get('user-config');

    const data = raw ? JSON.parse(raw) : {};
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    // If Blobs isn't available (local dev without netlify dev), return empty
    console.warn('Blobs unavailable:', err.message);
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    };
  }
};
