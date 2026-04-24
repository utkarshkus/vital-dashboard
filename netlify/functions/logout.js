// GET /api/logout — clears session cookie and redirects to login.
const { getSession, deleteSession, sessionCookie } = require('./lib/session');

exports.handler = async (event) => {
  const session = await getSession(event).catch(() => null);
  if (session) await deleteSession(event, session.token).catch(() => {});
  return {
    statusCode: 302,
    headers: {
      Location: '/login.html',
      'Set-Cookie': sessionCookie('', 0),
    },
    body: '',
  };
};
