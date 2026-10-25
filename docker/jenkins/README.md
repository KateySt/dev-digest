# Local Jenkins (manual test of the Jenkins CI target)

Opt-in Jenkins for trying DevDigest's **Export to CI → Jenkins** end to end.
Plain `docker compose up -d` still starts only Postgres.

1. `cp docker/jenkins/.env.example docker/jenkins/.env` and fill in the admin
   password, `OPENROUTER_API_KEY`, `GITHUB_USER` and `GITHUB_TOKEN` (repo scope).
   JCasC turns them into the credentials the generated Jenkinsfile expects:
   `devdigest-openrouter-api-key`, `devdigest-github-token` (secret text) and
   `devdigest-github-scan` (username + token, for GitHub Branch Source).
2. `docker compose --profile jenkins up -d --build jenkins` → http://localhost:8090
   (naming the service starts Jenkins only, not Postgres).
   The image has Node.js 22 on the PATH and the needed plugins.
3. Log in, open your user → **Security** → **API Token** → generate one. JCasC
   cannot seed API tokens, so this step is manual.
4. In DevDigest, open the Jenkins connection for the test repo (Export wizard
   → Configure → Jenkins server) with URL `http://localhost:8090`, the admin
   user and that token, then **Test connection**.
5. Export an agent with target Jenkins and tick **Also create the Jenkins job**
   (scan credential `devdigest-github-scan`), merge the `devdigest/ci` PR, open
   a PR in the same repo.
6. GitHub webhooks cannot reach localhost: the job scans every hour, so press
   **Scan Repository Now** on the job (or
   `curl -X POST -u admin:<api-token> http://localhost:8090/job/devdigest-review/build`).
7. After the `PR-<n>` build finishes, press **Refresh** on CI Runs.

`docker compose --profile jenkins down` stops it; the `devdigest_jenkins_home`
volume keeps jobs and builds between runs.
