# TSX-to-JSX Migration Evaluation: PlanVistaRoomify

> [!NOTE]
> This evaluation provides an architectural impact assessment and safe migration plan for converting the `PlanVistaRoomify` frontend from TypeScript (`.tsx` / `.ts`) to JavaScript (`.jsx` / `.js`). **No code changes or migrations were performed during this audit.**

---

## 1. Inventory of TypeScript Files

A complete inventory of the 15 TypeScript files in `PlanVistaRoomify` categorizes them by their operational role:

### Category A: React UI Components (6 Files) — Candidates for `.jsx`
These files render JSX markup and React hooks. They can be converted directly to `.jsx` once type annotations are removed:
1. `PlanVistaRoomify/app/root.tsx` (125 lines): Root HTML layout, Puter auth state provider, and ErrorBoundary.
2. `PlanVistaRoomify/app/routes/home.tsx` (162 lines): Home view, hero banner, project gallery grid.
3. `PlanVistaRoomify/app/routes/visualizer.$id.tsx` (239 lines): Main visualizer, comparison slider, Puter AI execution trigger.
4. `PlanVistaRoomify/components/Navbar.tsx` (72 lines): Navigation header and login/logout button.
5. `PlanVistaRoomify/components/Upload.tsx` (141 lines): Drag-and-drop floor plan uploader and simulated progress bar.
6. `PlanVistaRoomify/components/ui/Button.tsx` (31 lines): Shared button component with style variants.

### Category B: Non-UI TypeScript Modules (5 Files) — Candidates for `.js`
These files contain business logic, API calls, and utility functions:
1. `PlanVistaRoomify/lib/ai.action.ts` (49 lines): Formats base64 payload and calls `puter.ai.txt2img`.
2. `PlanVistaRoomify/lib/constants.ts` (59 lines): Constants, prompt strings, and timing configurations.
3. `PlanVistaRoomify/lib/puter.action.ts` (165 lines): High-level Puter SDK bridge (CRUD projects, auth).
4. `PlanVistaRoomify/lib/puter.hosting.ts` (73 lines): Subdomain management and file uploading to Puter hosting.
5. `PlanVistaRoomify/lib/utils.ts` (123 lines): Data URL / Blob conversions, MIME parsing, and URL helpers.

*(Note: `PlanVistaRoomify/lib/puter.worker.js` is already written in pure JavaScript).*

### Category C: Configuration & Ambient Type Definitions (4 Files)
1. `PlanVistaRoomify/type.d.ts` (128 lines): Global ambient type definitions (`DesignItem`, `AuthState`, `AuthContext`, etc.).
2. `PlanVistaRoomify/react-router.config.ts` (8 lines): React Router configuration (`ssr: true`).
3. `PlanVistaRoomify/app/routes.ts` (7 lines): Declarative route tree (`RouteConfig`).
4. `PlanVistaRoomify/vite.config.ts` (9 lines): Vite configuration importing `vite-tsconfig-paths`.

---

## 2. TypeScript-Specific Language Features Used

A manual inspection of the source code revealed extensive usage of TypeScript-specific constructs:

| TypeScript Construct | Occurrences & Locations | Migration Action Required |
|---|---|---|
| **Ambient Interfaces & Types** | 18 definitions in `type.d.ts` (`AuthState`, `DesignItem`, `VisualizerProps`, etc.) | Drop file or replace with JSDoc / PropTypes for documentation. |
| **React Router 7 Typegen** | `import type { Route } from "./+types/root"` in `root.tsx` and `home.tsx` | Must remove type imports; remove `Route.LinksFunction`, `Route.MetaArgs`, `Route.ErrorBoundaryProps`. |
| **`satisfies` Operator** | `react-router.config.ts` (`satisfies Config`), `app/routes.ts` (`satisfies RouteConfig`) | Remove `satisfies` keyword when converting to `.js`. |
| **Generic Hooks** | `useState<AuthState>`, `useState<DesignItem[]>`, `useOutletContext<AuthContext>()` | Simplify to standard JavaScript hook calls: `useState(DEFAULT_AUTH_STATE)`, `useOutletContext()`. |
| **Type Guards** | `isHostedUrl(value: unknown): value is string` in `lib/utils.ts` | Change to standard boolean check: `typeof value === "string" && value.includes(...)`. |
| **`as const` Assertions** | `STORAGE_PATHS = { ... } as const` in `lib/constants.ts` | Remove `as const` or use `Object.freeze(...)`. |
| **DOM / Event Types** | `React.DragEvent<HTMLDivElement>`, `React.ChangeEvent<HTMLInputElement>`, `FileList` in `Upload.tsx` | Strip all type annotations from event handler parameters. |
| **Type Assertions (`as`)** | `(await response.json()) as { project?: DesignItem }`, `(response as HTMLImageElement).src` | Remove `as` casts in API response parsing. |

---

## 3. Build & Compiler Dependencies

1. **`tsconfig.json` & `npm run typecheck`**:
   - `PlanVistaRoomify/package.json` contains:
     ```json
     "typecheck": "react-router typegen && tsc"
     ```
   - Converting to JSX requires updating `package.json` scripts, as `tsc` will fail or become redundant once types are stripped.
2. **`vite-tsconfig-paths`**:
   - In `vite.config.ts`, `tsconfigPaths()` allows Roomify to import using `components/Navbar` or `lib/puter.action` without relative paths (`../../`).
   - If `tsconfig.json` is deleted without configuring Vite path aliases (`resolve.alias`), module resolution will break across all imports.
3. **React Router v7 Framework Mode**:
   - React Router v7 generates files inside `.react-router/types/`. In pure JSX, route definitions in `app/routes.js` still work, but auto-generated type scaffolding is not required.

---

## 4. Risks & Consequences of Converting to JSX

```
+-----------------------------------------------------------------------------------------------+
|                                    MIGRATION RISK MATRIX                                      |
+------------------------------+------------+---------------------------------------------------+
| Risk Description             | Severity   | Mitigation Strategy                               |
+------------------------------+------------+---------------------------------------------------+
| Loss of Compile-Time Guard   | High       | Add runtime PropTypes or lightweight schema checks|
| on Puter API Payloads        |            | (e.g. Zod or manual validation) on API responses. |
| Path Alias Breakage          | High       | Configure Vite `resolve.alias` in `vite.config.js` |
|                              |            | to replace `vite-tsconfig-paths`.                |
| React Router Typegen Errors  | Medium     | Remove `+types` imports from route files.         |
| Runtime `undefined` Bugs     | Medium     | Perform comprehensive manual regression testing of|
|                              |            | AuthContext and Project saving workflows.         |
| Merge Conflict with Upstream | Low        | Maintain a clean Git checkpoint before migrating. |
+------------------------------+------------+---------------------------------------------------+
```

---

## 5. Recommended Safe Migration Sequence

If and when the user authorizes the migration, execute it in the following sequential order:

```
Step 1: Configure Vite Aliases & Checkpoint
   │
   ▼
Step 2: Migrate Standalone Leaf Components (Button.jsx, Upload.jsx, Navbar.jsx)
   │
   ▼
Step 3: Migrate Non-UI Utilities & Actions (constants.js, utils.js, ai.action.js, puter.action.js)
   │
   ▼
Step 4: Migrate Route Components (home.jsx, visualizer.$id.jsx, root.jsx)
   │
   ▼
Step 5: Migrate Configuration Files (routes.js, react-router.config.js, vite.config.js)
   │
   ▼
Step 6: Retire TypeScript Configuration (tsconfig.json, type.d.ts) & Update Build Scripts
   │
   ▼
Step 7: Verification & Regression Testing
```

### Rollback Strategy
If any runtime regressions occur during the migration:
1. Revert using Git: `git checkout -- .` and restore the last stable commit.
2. Ensure `package.json` retains TypeScript packages until the converted JSX branch passes all end-to-end user tests.
