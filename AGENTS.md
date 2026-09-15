<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Start here (any agent: Claude, GPT, Gemini, …)

1. Open [CONTEXT.md](CONTEXT.md) and read the **«▶ NEXT SESSION — START HERE»** section at the top. It is rewritten at the end of every session and is the single source of truth: what is verified live, what to verify first, the ordered build list with file paths and acceptance lines, what is blocked on the owner, and the conventions that have bitten us. Do not start work before reading it.
2. [CLAUDE.md](CLAUDE.md) holds the codebase conventions (server-action wrapper, Zod at boundaries, `requireAdmin()`, `revalidateTag('deals:default','max')`, driver-adapter Prisma, dotenv-before-prisma in scripts, `Discount.source` isolation, soft delete only, never auto-create Products). They apply to every tool, not only Claude.
3. [PHASES.md](PHASES.md) holds the roadmap history and the "Do NOT" invariants that exist because of past incidents.
4. Before every commit: `npm run test:run` and `npm run build` must be green. Pipeline verification happens in GitHub Actions (`gh workflow run scrape-chains.yml -f chain=<job> -f limit=N`), because Groq and ab.gr block the dev PC's IP.
5. End the session by rewriting the START HERE section in CONTEXT.md so the next agent, whichever model, knows exactly where things stand.
