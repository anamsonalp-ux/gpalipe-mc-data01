import { admin, getUser, AuthError, type User } from '@netlify/identity';
import { displayLogin, isValidUsername, normalizeUsername, USERNAME_DOMAIN } from '../../src/lib/username';

const isAdmin = (user: User | null) => !!user?.roles?.includes('admin');

const toPublic = (u: User) => ({
  id: u.id,
  email: u.email,
  username: displayLogin(u.email),
  name: u.name ?? (u.userMetadata?.full_name as string | undefined),
  roles: u.roles ?? [],
  createdAt: u.createdAt,
  lastSignInAt: u.lastSignInAt,
});

const errorResponse = (error: unknown) => {
  if (error instanceof AuthError) {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: 'Unexpected server error' }, { status: 500 });
};

export default async (req: Request) => {
  const caller = await getUser();
  if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(caller)) return Response.json({ error: 'Admins only' }, { status: 403 });

  try {
    if (req.method === 'GET') {
      const users = await admin.listUsers({ perPage: 1000 });
      return Response.json({ users: users.map(toPublic) });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      const username = typeof body?.username === 'string' ? normalizeUsername(body.username) : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!isValidUsername(username)) {
        return Response.json(
          { error: 'Usernames must be 3–32 characters: letters, numbers, dots, dashes or underscores.' },
          { status: 422 },
        );
      }
      if (password.length < 8) {
        return Response.json({ error: 'Passwords need at least 8 characters.' }, { status: 422 });
      }
      const created = await admin.createUser({
        email: `${username}@${USERNAME_DOMAIN}`,
        password,
        data: {
          user_metadata: { username, ...(name ? { full_name: name } : {}) },
          app_metadata: { roles: body?.admin === true ? ['admin'] : ['user'] },
        },
      });
      return Response.json({ user: toPublic(created) }, { status: 201 });
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => null);
      const id = typeof body?.id === 'string' ? body.id : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!id) return Response.json({ error: 'Missing user id' }, { status: 400 });
      if (password.length < 8) {
        return Response.json({ error: 'Passwords need at least 8 characters.' }, { status: 422 });
      }
      const updated = await admin.updateUser(id, { password });
      return Response.json({ user: toPublic(updated) });
    }

    if (req.method === 'DELETE') {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return Response.json({ error: 'Missing user id' }, { status: 400 });
      if (id === caller.id) return Response.json({ error: 'You cannot delete your own account.' }, { status: 400 });
      await admin.deleteUser(id);
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const config = { path: '/api/admin/users' };
