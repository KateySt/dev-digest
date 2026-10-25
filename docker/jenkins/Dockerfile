# Local Jenkins for manually testing the DevDigest "Export to CI → Jenkins" target.
# Started only with `docker compose --profile jenkins up -d` (see docker/jenkins/README.md).
FROM node:22-bookworm-slim AS node

FROM jenkins/jenkins:lts-jdk21
# The DevDigest runner needs Node.js 20+ on the agent's PATH; one binary is enough.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
COPY casc.yaml /usr/share/jenkins/casc.yaml
ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/casc.yaml \
    JAVA_OPTS=-Djenkins.install.runSetupWizard=false
