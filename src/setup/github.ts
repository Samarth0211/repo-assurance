// A reviewed, published analyzer revision; update explicitly after validating a new engine.
export const PILOT_ENGINE_REVISION = 'b03930c3d61029f7796eedab1bfe2bbb6d359e73';
export const WORKFLOW_PATH = '.github/workflows/repo-assurance.yml';
export const GUIDE_PATH = '.assurance/SETUP.md';

export function pilotWorkflow(): string {
  return `# Pilot report: do not treat this workflow as an authoritative merge gate.
# See .assurance/SETUP.md before enabling enforcement.
name: Repo Assurance (pilot)

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  architecture-report:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out the project
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          path: candidate
          persist-credentials: false
      - name: Check out the reviewed analyzer
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          repository: Samarth0211/repo-assurance
          ref: ${PILOT_ENGINE_REVISION}
          path: assurance-tool
          persist-credentials: false
      - name: Set up Node
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: 22
      - name: Set up Python
        # Python is used only to parse Python source, never to import the project.
        uses: actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065 # v5
        with:
          python-version: '3.13'
      - name: Install the analyzer
        working-directory: assurance-tool
        run: npm ci --ignore-scripts
      - name: Build the analyzer
        working-directory: assurance-tool
        run: npm run build
      # Target dependencies are deliberately not installed or executed here.
      # JS/TS dependencies need a reviewed isolated preparation step. Python third-party
      # imports need explicit externals; Python packages are never imported or installed.
      - name: Inspect architecture
        run: node assurance-tool/dist/src/cli.js scan --root candidate
`;
}

export function setupGuide(): string {
  return `# Your Repo Assurance setup

## Everyday use

The wizard saved or reused your policy in config.json. Source files were not changed.
Run the wizard again to check readiness; existing configuration and workflow files
are preserved. The terminal shows commands for your local installation.

With a globally installed CLI, run these from your project directory:

\`\`\`sh
repo-assurance scan
repo-assurance doctor
\`\`\`

If you installed from source, run \`node dist/src/cli.js scan --root <your-project>\`
from the Repo Assurance checkout. Quote paths containing spaces.

- Observation reports problems without failing for architecture findings.
- Enforcement fails for new error-level findings. \`check\` always enforces.
- Incomplete analysis exits 2 in either mode; it is not a clean result.
- Review existing debt before using \`baseline create --reason "..."\`.
  Setup does not accept or hide findings for you.
- Fix missing dependencies through your project's normal trusted setup, then scan again.
- A clean result covers the configured module boundaries and cycles only.

## GitHub onboarding

If you chose GitHub help, the wizard created or preserved \`${WORKFLOW_PATH}\`.
If that file is absent, run setup again and choose GitHub help when ready.
Review the workflow along with
\`.assurance/config.json\`, then commit and push through your normal review process.
New PRs can run the pilot; after the workflow reaches your default branch you can
also run it from GitHub's Actions tab. Read the "Inspect architecture" log.

The generated template pins analyzer revision \`${PILOT_ENGINE_REVISION}\`.
It uses GitHub-hosted runners and a read-only token, and installs only the analyzer.
It does not install project dependencies. JS/TS missing packages require a reviewed,
isolated preparation step. Python third-party import names need explicit externals;
Python packages are never imported or installed. Unresolved analysis is reported explicitly.
Your existing workflow, if any, has been kept unchanged and may differ from this template.

## Before blocking merges

The pilot reads the candidate's policy. A PR can edit that policy or workflow, so
this is not an authoritative merge gate. The wizard does not change GitHub settings.

Your repository owner needs to:

1. Review the rules, dependency preparation, analyzer revision, and first results.
2. Install the initial policy through a reviewed bootstrap.
3. Protect analyzer selection, workflow and policy changes under owner review.
4. Use a trusted analyzer and publisher, with \`check --base <current-base-sha>\`
   against a clean integration candidate containing the latest target revision.
5. Require that check in branch protections, require up-to-date branches (or a
   supported merge queue), and review bypass permissions.
6. Verify that a deliberately failing test PR cannot merge.

Keep your normal tests and reviews. GitHub runner usage follows your account's
allowance; the tool itself requires no paid service or model.

Full integration instructions: https://github.com/Samarth0211/repo-assurance/blob/main/docs/ci.md
Security reference: https://docs.github.com/en/actions/reference/security/secure-use
`;
}
