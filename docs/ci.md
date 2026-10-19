# CI, trusted policy, and stale PRs

## A local check is one component of enforcement

`repo-assurance setup` can generate a pilot workflow and an owner checklist. This
removes workflow boilerplate during evaluation. The template pins a published
analyzer in a separate checkout, uses read-only permissions, and never installs
target dependencies. It runs `scan` using candidate policy and is not an authoritative
merge gate. Use the trust pattern below before turning findings into merge requirements.
See [guided setup](guided-setup.md) for the generated files and repeat-run behavior.

Python analysis needs a trusted Python 3.10+ interpreter outside the candidate.
The generated pilot provisions Python 3.13. Python packages are not installed or
imported; declare reviewed third-party import names explicitly. Existing pilot
files are preserved by setup, so their analyzer revision/runtime must be upgraded
deliberately for Python support. See the [Python guide](python.md).

The repository host must require the check, enforce branch freshness, protect the workflow and policy, and control bypass permissions. Repo Assurance cannot configure or guarantee those properties merely by reading source.

The project's own CI tests its implementation on Linux and Windows. That workflow is not a complete company deployment. In particular, running an analyzer copied from an untrusted PR would let that PR replace the analyzer.

## Trusted execution pattern

1. Provision a reviewed/pinned Repo Assurance release outside the candidate checkout.
2. Check out the integration candidate into an isolated working directory with complete required Git history.
3. Fetch the target revision through a trusted runner operation and record its exact SHA.
4. Prepare target dependencies using an organization's approved isolated process, without production credentials.
5. Invoke the trusted CLI against the candidate: `repo-assurance check --root <candidate> --base <base-sha>`.
6. Preserve the exit code and archive JSON evidence through a trusted publishing step.
7. Require the authoritative check in repository protections and require the candidate to be up to date at merge time.

The engine reads `.assurance/config.json` and `.assurance/baseline.json` from the specified base revision. It requires that revision to be an ancestor of the committed candidate, rejects dirty/untracked source, and rejects candidate edits to protected policy/baseline files. It detects a selected local base ref moving during analysis. It does not continuously query a remote branch.

Do not interpolate PR titles, branch names, or source text into shell commands. Pass controlled values through arguments/environment variables. An untrusted candidate report must not itself have authority to publish a green check; choose a trusted publisher and result provenance.

## Bootstrap and policy changes

The first policy must be installed through a reviewed bootstrap before using `--base`. Without a base policy, enforcement is inconclusive.

The alpha intentionally has no in-band flag that lets a PR approve its own policy change. Policy and baseline changes, including reconciliation, require a separate authorized review/update process in your hosting system. Validate the proposed configuration locally, require the designated owners, and record any narrowly scoped administrative bypass. Evaluate application changes under the existing trusted policy until the policy update is accepted.

Keep engine/version selection and publishing workflows under equivalent protection. An unchanged check name alone does not prove a trusted analyzer ran.

## Five simultaneous PRs

Run candidates in separate workspaces. Share only trusted immutable artifacts. Each report identifies its own head/base and content. There is no shared mutable cache in this alpha.

Native merge queues can test a candidate including the target and earlier queued changes. Support their `merge_group` trigger in the surrounding CI. Without a queue, require an up-to-date branch and rerun the required checks after updates.

## A PR approved five days ago

If A was checked against M100 and main is now M110, the old success is insufficient. Update or synthesize the candidate including M110 and run the checks with M110 as base. A textual merge without conflict does not establish architectural or behavioral compatibility.

The test suite creates ten intervening commits, confirms that the stale candidate is inconclusive, merges the updated base into the candidate, and verifies it again. The final race between checking and merging must be closed by the host's protected merge mechanism. A webhook after merge cannot prevent the merge.

GitHub documents [strict branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) and [merge queue availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Native queues are not assumed to be available for public personal-account repositories. For `samarth0211/repo-assurance`, strict branch freshness is the baseline integration option.

## Public forks and company runners

Do not run arbitrary public-fork code on persistent company runners with network access or credentials. Do not execute candidate code in a privileged `pull_request_target` workflow. Analysis itself never runs application scripts; dependency installation and compiler setup performed by your CI can introduce execution, so isolate those steps independently. See [GitHub's secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use).

## Required status selection

Use a unique gate name. Where the hosting platform supports it, restrict the expected status publisher. Treat missing/cancelled/inconclusive results as blocking. Make configured bypass permissions visible to repository owners. The project workflow supplies an aggregate `quality-gate` for its own tests; it is not an attestation service for other repositories.
