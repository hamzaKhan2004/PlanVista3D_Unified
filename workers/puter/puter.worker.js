const LEGACY_PROJECT_PREFIX = 'planVista3D_project_';
const USER_PROJECT_PREFIX = (userId) => `planVista3D_user_${userId}_project_`;
const getUserProjectKey = (userId, id) => `${USER_PROJECT_PREFIX(userId)}${id}`;
const getLegacyKey = (id) => `${LEGACY_PROJECT_PREFIX}${id}`;

const jsonError = (status, message, extra = {}) => {
    return new Response(JSON.stringify({ error: message, ...extra }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
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
    try {
        if (typeof userPuter.kv.del === 'function') {
            await userPuter.kv.del(key);
        } else if (typeof userPuter.kv.delete === 'function') {
            await userPuter.kv.delete(key);
        } else {
            await userPuter.kv.set(key, null);
        }
    } catch (e) {
        console.warn(`KV deletion warning for ${key}:`, e);
    }
};

router.post('/api/projects/save', async ({ request, user }) => {
    try {
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

        // Ownership verification: check if project already exists under user key or legacy key
        const userKey = getUserProjectKey(userId, project.id);
        const legacyKey = getLegacyKey(project.id);

        let existing = null;
        try {
            existing = await userPuter.kv.get(userKey);
        } catch (_) {}

        if (!existing) {
            try {
                existing = await userPuter.kv.get(legacyKey);
            } catch (_) {}
        }

        // If existing project belongs to another user, deny overwrite
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

        // Save under owner-scoped key
        await userPuter.kv.set(userKey, payload);

        // Keep legacy key updated if it was previously saved under legacy key, ensuring backward compatibility
        if (existing && !existing.ownerId) {
            try {
                await userPuter.kv.set(legacyKey, payload);
            } catch (_) {}
        }

        return { saved: true, id: project.id, project: payload };

    } catch (e) {
        return jsonError(500, 'Failed to save project', {
            message: e.message || 'Unknown error'
        });
    }
});

router.get('/api/projects/list', async ({ user }) => {
    try {
        const userPuter = user?.puter;
        if (!userPuter) return jsonError(401, 'Authentication failed: missing user session');

        const verifiedUser = await getVerifiedUser(userPuter);
        if (!verifiedUser?.uuid) return jsonError(401, 'Authentication failed: invalid user session');
        const userId = verifiedUser.uuid;

        const projectMap = new Map();

        // 1. Fetch user-scoped projects
        try {
            const userPrefix = USER_PROJECT_PREFIX(userId);
            const userResult = await userPuter.kv.list(userPrefix, true);
            const userList = normalizeKvList(userResult);

            for (const entry of userList) {
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

        // 2. Fetch legacy projects: only include if explicitly owned by this user
        try {
            const legacyResult = await userPuter.kv.list(LEGACY_PROJECT_PREFIX, true);
            const legacyList = normalizeKvList(legacyResult);

            for (const entry of legacyList) {
                const item = entry?.value || entry;
                if (!item?.id) continue;

                // Never expose other users' projects
                if (item.ownerId && item.ownerId !== userId) {
                    continue;
                }

                // If owned by this user and not already in map, include it
                if (item.ownerId === userId) {
                    if (!projectMap.has(item.id)) {
                        projectMap.set(item.id, {
                            ...item,
                            ownerId: userId,
                            isPublic: Boolean(item.isPublic || item.visibility === 'public'),
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("Legacy KV list error:", e);
        }

        const projects = Array.from(projectMap.values()).sort(
            (a, b) => (new Date(b.updatedAt || b.timestamp || 0).getTime()) - (new Date(a.updatedAt || a.timestamp || 0).getTime())
        );

        return { projects };

    } catch (e) {
        console.error("KV LIST ERROR:", e);
        return jsonError(500, 'Failed to list projects', {
            message: e.message || 'Unknown error'
        });
    }
});

router.get('/api/projects/get', async ({ request, user }) => {
    try {
        const userPuter = user?.puter;
        const verifiedUser = userPuter ? await getVerifiedUser(userPuter) : null;
        const userId = verifiedUser?.uuid || null;

        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) return jsonError(400, 'Project ID is required');

        let project = null;

        // Try owner-scoped key first if user is authenticated
        if (userId) {
            try {
                project = await userPuter.kv.get(getUserProjectKey(userId, id));
            } catch (_) {}
        }

        // Try legacy key
        if (!project) {
            try {
                if (userPuter?.kv?.get) {
                    project = await userPuter.kv.get(getLegacyKey(id));
                }
            } catch (_) {}
        }

        if (!project) return jsonError(404, 'Project not found');

        const isPublic = project.isPublic === true || project.visibility === 'public';
        const isOwner = userId && project.ownerId === userId;

        // Privacy gate: If private, require ownership
        if (!isPublic) {
            if (!userId) {
                return jsonError(401, 'Authentication required to access private project');
            }
            if (project.ownerId && !isOwner) {
                return jsonError(403, 'Permission denied: private project');
            }
        }

        return { project };

    } catch (e) {
        return jsonError(500, 'Failed to get project', {
            message: e.message || 'Unknown error'
        });
    }
});

const handleDeleteProject = async ({ request, user }) => {
    try {
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
        try {
            project = await userPuter.kv.get(userKey);
        } catch (_) {}

        if (!project) {
            try {
                project = await userPuter.kv.get(legacyKey);
            } catch (_) {}
        }

        if (!project) {
            return jsonError(404, 'Project not found');
        }

        // Ownership enforcement: cannot delete another user's project
        if (project.ownerId && project.ownerId !== userId) {
            return jsonError(403, 'Permission denied: cannot delete another user\'s project');
        }

        // Delete from user key
        await kvDelete(userPuter, userKey);

        // If legacy key exists and is owned by this user (or legacy unclaimed), delete it too
        if (project && (!project.ownerId || project.ownerId === userId)) {
            await kvDelete(userPuter, legacyKey);
        }

        return { deleted: true, id };
    } catch (e) {
        return jsonError(500, 'Failed to delete project', {
            message: e.message || 'Unknown error'
        });
    }
};

router.post('/api/projects/delete', handleDeleteProject);
router.delete('/api/projects/delete', handleDeleteProject);

