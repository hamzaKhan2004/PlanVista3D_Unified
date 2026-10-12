const PROJECT_PREFIX = 'planVista3D_project_';

const jsonError = (status, message, extra = {}) => {
    return new Response(JSON.stringify({ error: message, ...extra }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
};

const getUserId = async (userPuter) => {
    try {
        const user = await userPuter.auth.getUser();
        return user?.uuid || null;
    } catch {
        return null;
    }
};

router.post('/api/projects/save', async ({ request, user }) => {
    try {
        const userPuter = user?.puter;

        if (!userPuter) return jsonError(401, 'Authentication failed');

        const body = await request.json();
        const project = body?.project;

        if (!project?.id || !project?.sourceImage) {
            return jsonError(400, 'Project ID and source image are required');
        }

        const payload = {
            ...project,
            updatedAt: new Date().toISOString(),
        };

        const userId = await getUserId(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const key = `${PROJECT_PREFIX}${project.id}`;
        await userPuter.kv.set(key, payload);

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
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const userId = await getUserId(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const result = await userPuter.kv.list(PROJECT_PREFIX, true);

        // Normalize to array
        let listArray = [];

        if (Array.isArray(result)) {
            listArray = result;
        } else if (Array.isArray(result?.keys)) {
            listArray = result.keys;
        } else if (Array.isArray(result?.items)) {
            listArray = result.items;
        } else if (result && typeof result === 'object') {
            listArray = Object.values(result);
        }

        const projects = listArray.map((entry) => ({
            ...(entry?.value || entry),
            isPublic: true,
        }));

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
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const userId = await getUserId(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) return jsonError(400, 'Project ID is required');

        const key = `${PROJECT_PREFIX}${id}`;
        const project = await userPuter.kv.get(key);

        if (!project) return jsonError(404, 'Project not found');

        return { project };

    } catch (e) {
        return jsonError(500, 'Failed to get project', {
            message: e.message || 'Unknown error'
        });
    }
});
