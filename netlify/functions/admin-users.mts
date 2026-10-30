import { admin, getUser, AuthError, type User } from '@netlify/identity';

const isAdmin = (user: User | null) => !!user?.roles?.includes('admin');

const toPublic = (u: User) => ({
  id: u.id,
  email: u.email,
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
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!email || password.length < 8) {
        return Response.json({ error: 'A valid email and a password of at least 8 characters are required.' }, { status: 422 });
      }
      const created = await admin.createUser({
        email,
        password,
        data: {
          user_metadata: name ? { full_name: name } : {},
          app_metadata: { roles: body?.admin === true ? ['admin'] : ['user'] },
        },
      });
      return Response.json({ user: toPublic(created) }, { status: 201 });
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
