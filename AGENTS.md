# Website change workflow — owner instruction, 27 October 2026

For every change:
1. Work on a feature branch; leave the live branch unchanged.
2. Inspect the change in an isolated preview before asking for deployment approval.
3. Check affected customer flows and existing catalogue/media, forms and admin flows as appropriate. Clearly distinguish simulated storage from real Cloudflare verification, and desktop checks from real mobile checks.
4. Fix observed failures, then repeat the affected checks. Report limitations honestly; do not guarantee zero regressions.
5. Record the prior deployed version and commit before deployment. Prepare a rollback that removes the specific change without reverting unrelated updates. Back up production data separately before any schema or destructive data change.
6. Present the preview, check results, remaining risks and rollback plan; ask the owner for explicit deployment confirmation. Never infer deployment approval from implementation approval.
7. After approval and deployment, smoke-test the live affected flows. If a regression appears, restore the previous known good deployment or revert the feature change, preserving user data.

Do not push code to a remote until authorized. Do not deploy preview test data to production.
