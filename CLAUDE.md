# pg-lightquery

## This repository is public

`dr-aiuta/pgquery` is a public GitHub repository, and the package is published to npm. Safety guards must treat this repository as public. Apply every privacy and security check on that basis.

Everything that reaches the remote is world-readable and stays in its history. That covers files, commit messages, branch names, pull request titles and descriptions, review comments and issues.

Never put any of the following into this repository, or into anything posted to it:

- The name of a private project that uses the library. Write "Consumer A", "Consumer B" and so on. `docs/plans/README.md` lists the letters in use.
- File paths, routes, table names or code from a private project.
- A weakness in a private project, or in a deployment of one.
- A vulnerability in a released version of this library that is not fixed yet. Open a private security advisory on GitHub instead, and publish the details together with the fix.
- Secrets, tokens, connection strings with credentials, personal data or real customer data. Examples use the fixtures in `tests/tables/`.
- Absolute paths from a local machine.

If a task needs such material, keep it outside the repository and say where it is.

If any of it is already in a file, a commit, a branch or a pull request, stop and tell the user before pushing. Removing it from the latest commit does not remove it from the history.

## Checks

Run both before a commit:

- `npx tsc --noEmit`
- `npm test`

The suites in `tests/integration/live/` run only when `PGLIGHTQUERY_TEST_DATABASE_URL` is set. CI sets it and runs them against PostgreSQL.
