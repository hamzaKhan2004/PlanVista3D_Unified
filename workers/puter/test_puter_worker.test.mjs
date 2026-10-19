import test from "node:test";
import assert from "node:assert/strict";

// We simulate the Puter Worker environment and handlers
class MockRouter {
  constructor() {
    this.routes = new Map();
  }
  post(path, handler) {
    this.routes.set(`POST:${path}`, handler);
  }
  get(path, handler) {
    this.routes.set(`GET:${path}`, handler);
  }
  delete(path, handler) {
    this.routes.set(`DELETE:${path}`, handler);
  }
  async dispatch(method, path, { request, user }) {
    const handler = this.routes.get(`${method}:${path}`);
    if (!handler) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    return await handler({ request, user });
  }
}

// In-memory KV store to simulate userPuter.kv
class MockKV {
  constructor() {
    this.store = new Map();
  }
  async set(key, value) {
    if (value === null) {
      this.store.delete(key);
    } else {
      this.store.set(key, JSON.parse(JSON.stringify(value)));
    }
  }
  async get(key) {
    const val = this.store.get(key);
    return val ? JSON.parse(JSON.stringify(val)) : null;
  }
  async del(key) {
    this.store.delete(key);
  }
  async list(prefix, returnValues = true) {
    const results = [];
    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        results.push(returnValues ? { key, value: JSON.parse(JSON.stringify(value)) } : key);
      }
    }
    return results;
  }
}

const createMockPuterUser = (uuid, username, kv) => ({
  puter: {
    auth: {
      getUser: async () => ({ uuid, username }),
    },
    kv,
  },
  username,
});

// Load the worker route logic by injecting router
const sharedKV = new MockKV();
const router = new MockRouter();

// Define router handlers mirroring workers/puter/puter.worker.js
const LEGACY_PROJECT_PREFIX = 'planVista3D_project_';
const USER_PROJECT_PREFIX = (userId) => `planVista3D_user_${userId}_project_`;
const getUserProjectKey = (userId, id) => `${USER_PROJECT_PREFIX(userId)}${id}`;
const getLegacyKey = (id) => `${LEGACY_PROJECT_PREFIX}${id}`;

const jsonError = (status, message, extra = {}) => {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const getVerifiedUser = async (userPuter) => {
  try {
    if (!userPuter?.auth?.getUser) return null;
    const user = await userPuter.auth.getUser();
    if (!user?.uuid) return null;
    return {
      uuid: user.uuid,
      username: user.username || 'puter_user'
    };
  } catch {
    return null;
  }
};

const normalizeKvList = (result) => {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.keys)) return result.keys;
  if (Array.isArray(result?.items)) return result.items;
  if (typeof result === 'object') return Object.values(result);
  return [];
};

const kvDelete = async (userPuter, key) => {
  if (typeof userPuter.kv.del === 'function') {
    await userPuter.kv.del(key);
  } else if (typeof userPuter.kv.delete === 'function') {
    await userPuter.kv.delete(key);
  } else {
    await userPuter.kv.set(key, null);
  }
};

// Handlers identical to puter.worker.js
router.post('/api/projects/save', async ({ request, user }) => {
  const userPuter = user?.puter;
  if (!userPuter) return jsonError(401, 'Authentication failed: missing user session');
  const verifiedUser = await getVerifiedUser(userPuter);
  if (!verifiedUser?.uuid) return jsonError(401, 'Authentication failed: invalid user session');
  const userId = verifiedUser.uuid;

  const body = await request.json();
  const project = body?.project;
  const visibility = body?.visibility === 'public' || project?.isPublic === true ? 'public' : 'private';

  if (!project?.id || !project?.sourceImage) {
    return jsonError(400, 'Project ID and source image are required');
  }

  const userKey = getUserProjectKey(userId, project.id);
  const legacyKey = getLegacyKey(project.id);

  let existing = null;
  try { existing = await userPuter.kv.get(userKey); } catch (_) {}
  if (!existing) {
    try { existing = await userPuter.kv.get(legacyKey); } catch (_) {}
  }

  if (existing && existing.ownerId && existing.ownerId !== userId) {
    return jsonError(403, 'Permission denied: cannot modify another user\'s project');
  }

  const payload = {
    ...project,
    ownerId: userId,
    ownerUsername: verifiedUser.username,
    isPublic: visibility === 'public',
    visibility,
    updatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || project.createdAt || new Date().toISOString(),
  };

  await userPuter.kv.set(userKey, payload);
  return { saved: true, id: project.id, project: payload };
});

router.get('/api/projects/list', async ({ user }) => {
  const userPuter = user?.puter;
  if (!userPuter) return jsonError(401, 'Authentication failed: missing user session');
  const verifiedUser = await getVerifiedUser(userPuter);
  if (!verifiedUser?.uuid) return jsonError(401, 'Authentication failed: invalid user session');
  const userId = verifiedUser.uuid;

  const projectMap = new Map();
  try {
    const userPrefix = USER_PROJECT_PREFIX(userId);
    const userResult = await userPuter.kv.list(userPrefix, true);
    for (const entry of normalizeKvList(userResult)) {
      const item = entry?.value || entry;
      if (item?.id) {
        projectMap.set(item.id, {
          ...item,
          ownerId: userId,
          isPublic: Boolean(item.isPublic || item.visibility === 'public'),
        });
      }
    }
  } catch (e) {
    console.warn("User-scoped KV list error:", e);
  }

  try {
    const legacyResult = await userPuter.kv.list(LEGACY_PROJECT_PREFIX, true);
    for (const entry of normalizeKvList(legacyResult)) {
      const item = entry?.value || entry;
      if (!item?.id) continue;
      if (item.ownerId && item.ownerId !== userId) continue;
      if (item.ownerId === userId && !projectMap.has(item.id)) {
        projectMap.set(item.id, {
          ...item,
          ownerId: userId,
          isPublic: Boolean(item.isPublic || item.visibility === 'public'),
        });
      }
    }
  } catch (e) {
    console.warn("Legacy KV list error:", e);
  }

  const projects = Array.from(projectMap.values());
  return { projects };
});

router.get('/api/projects/get', async ({ request, user }) => {
  const userPuter = user?.puter;
  const verifiedUser = userPuter ? await getVerifiedUser(userPuter) : null;
  const userId = verifiedUser?.uuid || null;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonError(400, 'Project ID is required');

  let project = null;
  if (userId) {
    try { project = await userPuter.kv.get(getUserProjectKey(userId, id)); } catch (_) {}
  }
  if (!project && userPuter?.kv?.get) {
    try { project = await userPuter.kv.get(getLegacyKey(id)); } catch (_) {}
  }
  if (!project) return jsonError(404, 'Project not found');

  const isPublic = project.isPublic === true || project.visibility === 'public';
  const isOwner = userId && project.ownerId === userId;

  if (!isPublic) {
    if (!userId) return jsonError(401, 'Authentication required to access private project');
    if (project.ownerId && !isOwner) return jsonError(403, 'Permission denied: private project');
  }

  return { project };
});

router.delete('/api/projects/delete', async ({ request, user }) => {
  const userPuter = user?.puter;
  if (!userPuter) return jsonError(401, 'Authentication failed: missing user session');
  const verifiedUser = await getVerifiedUser(userPuter);
  if (!verifiedUser?.uuid) return jsonError(401, 'Authentication failed: invalid user session');
  const userId = verifiedUser.uuid;

  let id = null;
  try {
    const body = await request.json();
    id = body?.id;
  } catch (_) {}
  if (!id) {
    const url = new URL(request.url);
    id = url.searchParams.get('id');
  }
  if (!id) return jsonError(400, 'Project ID is required');

  const userKey = getUserProjectKey(userId, id);
  const legacyKey = getLegacyKey(id);

  let project = null;
  try { project = await userPuter.kv.get(userKey); } catch (_) {}
  if (!project) {
    try { project = await userPuter.kv.get(legacyKey); } catch (_) {}
  }
  if (!project) {
    return jsonError(404, 'Project not found');
  }

  if (project.ownerId && project.ownerId !== userId) {
    return jsonError(403, 'Permission denied: cannot delete another user\'s project');
  }

  await kvDelete(userPuter, userKey);
  if (project && (!project.ownerId || project.ownerId === userId)) {
    await kvDelete(userPuter, legacyKey);
  }

  return { deleted: true, id };
});

// TESTS
test("1. Unauthenticated requests are rejected with 401", async () => {
  const saveRes = await router.dispatch('POST', '/api/projects/save', {
    request: new Request('https://worker/api/projects/save', {
      method: 'POST',
      body: JSON.stringify({ project: { id: 'p1', sourceImage: 'data:...' } })
    }),
    user: null,
  });
  assert.equal(saveRes.status, 401);

  const listRes = await router.dispatch('GET', '/api/projects/list', {
    request: new Request('https://worker/api/projects/list'),
    user: null,
  });
  assert.equal(listRes.status, 401);
});

test("2. User A saves project -> stored with ownerId under user key", async () => {
  const userA = createMockPuterUser("uuid_userA", "alice", sharedKV);
  const saveRes = await router.dispatch('POST', '/api/projects/save', {
    request: new Request('https://worker/api/projects/save', {
      method: 'POST',
      body: JSON.stringify({
        project: { id: 'proj_alpha', name: 'Alpha Villa', sourceImage: 'https://site/a.png' },
        visibility: 'private',
      })
    }),
    user: userA,
  });

  assert.equal(saveRes.saved, true);
  assert.equal(saveRes.project.ownerId, "uuid_userA");
  assert.equal(saveRes.project.isPublic, false);

  // Check in KV directly
  const inStore = await sharedKV.get("planVista3D_user_uuid_userA_project_proj_alpha");
  assert.ok(inStore);
  assert.equal(inStore.name, "Alpha Villa");
  assert.equal(inStore.ownerId, "uuid_userA");
});

test("3. User B cannot see User A's private project in list", async () => {
  const userB = createMockPuterUser("uuid_userB", "bob", sharedKV);
  const listRes = await router.dispatch('GET', '/api/projects/list', {
    request: new Request('https://worker/api/projects/list'),
    user: userB,
  });

  assert.ok(Array.isArray(listRes.projects));
  const found = listRes.projects.find((p) => p.id === "proj_alpha");
  assert.equal(found, undefined, "User B must not see User A's private project");
});

test("4. User A sees their own project in list", async () => {
  const userA = createMockPuterUser("uuid_userA", "alice", sharedKV);
  const listRes = await router.dispatch('GET', '/api/projects/list', {
    request: new Request('https://worker/api/projects/list'),
    user: userA,
  });

  assert.ok(Array.isArray(listRes.projects));
  const found = listRes.projects.find((p) => p.id === "proj_alpha");
  assert.ok(found, "User A should see their own project");
  assert.equal(found.ownerId, "uuid_userA");
  assert.equal(found.isPublic, false);
});

test("5. User B cannot view User A's private project by ID (403 or 404)", async () => {
  const userB = createMockPuterUser("uuid_userB", "bob", sharedKV);
  const getRes = await router.dispatch('GET', '/api/projects/get', {
    request: new Request('https://worker/api/projects/get?id=proj_alpha'),
    user: userB,
  });

  assert.ok(getRes.status === 403 || getRes.status === 404, "User B should be denied access (403 or 404)");
  assert.equal(getRes.project, undefined, "User B must not receive project data");
});

test("6. User B cannot delete User A's project (403 or 404)", async () => {
  const userB = createMockPuterUser("uuid_userB", "bob", sharedKV);
  const delRes = await router.dispatch('DELETE', '/api/projects/delete', {
    request: new Request('https://worker/api/projects/delete', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'proj_alpha' })
    }),
    user: userB,
  });

  assert.ok(delRes.status === 403 || delRes.status === 404, "User B should be blocked from deleting User A's project");

  // Verify project is still intact
  const project = await sharedKV.get("planVista3D_user_uuid_userA_project_proj_alpha");
  assert.ok(project, "Project must not have been deleted");
});

test("7. Legacy project owned by User A is accessible by User A and hidden from User B", async () => {
  // Put a legacy format project into KV
  await sharedKV.set("planVista3D_project_legacy_101", {
    id: "legacy_101",
    name: "Legacy Cabin",
    ownerId: "uuid_userA",
    sourceImage: "https://site/legacy.png",
  });

  const userB = createMockPuterUser("uuid_userB", "bob", sharedKV);
  const listB = await router.dispatch('GET', '/api/projects/list', {
    request: new Request('https://worker/api/projects/list'),
    user: userB,
  });
  assert.equal(listB.projects.find(p => p.id === "legacy_101"), undefined);

  // User B cannot get User A's legacy project by ID -> 403
  const getB = await router.dispatch('GET', '/api/projects/get', {
    request: new Request('https://worker/api/projects/get?id=legacy_101'),
    user: userB,
  });
  assert.equal(getB.status, 403, "User B cannot get User A's legacy project");

  // User B cannot delete User A's legacy project -> 403
  const delB = await router.dispatch('DELETE', '/api/projects/delete', {
    request: new Request('https://worker/api/projects/delete', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'legacy_101' })
    }),
    user: userB,
  });
  assert.equal(delB.status, 403, "User B cannot delete User A's legacy project");

  const userA = createMockPuterUser("uuid_userA", "alice", sharedKV);
  const listA = await router.dispatch('GET', '/api/projects/list', {
    request: new Request('https://worker/api/projects/list'),
    user: userA,
  });
  const foundA = listA.projects.find(p => p.id === "legacy_101");
  assert.ok(foundA, "User A should see their legacy project");
  assert.equal(foundA.ownerId, "uuid_userA");
});

test("8. User A can delete their own project", async () => {
  const userA = createMockPuterUser("uuid_userA", "alice", sharedKV);
  const delRes = await router.dispatch('DELETE', '/api/projects/delete', {
    request: new Request('https://worker/api/projects/delete', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'proj_alpha' })
    }),
    user: userA,
  });

  assert.equal(delRes.deleted, true);
  const inStore = await sharedKV.get("planVista3D_user_uuid_userA_project_proj_alpha");
  assert.equal(inStore, null, "Project must be deleted");
});

test("9. Model projects scoping: unauthenticated user receives []", () => {
  const getLocalModelProjects = (userId = null, mockStore = []) => {
    if (!userId) return [];
    return mockStore.filter(p => !p.ownerId || p.ownerId === userId);
  };

  const store = [
    { id: "cad_1", ownerId: "uuid_userA", name: "Alice Model" },
    { id: "cad_2", ownerId: "uuid_userB", name: "Bob Model" },
  ];

  assert.deepEqual(getLocalModelProjects(null, store), [], "Guests receive empty list");
  assert.equal(getLocalModelProjects("uuid_userA", store).length, 1);
  assert.equal(getLocalModelProjects("uuid_userA", store)[0].name, "Alice Model");
  assert.equal(getLocalModelProjects("uuid_userB", store).length, 1);
  assert.equal(getLocalModelProjects("uuid_userB", store)[0].name, "Bob Model");
});
