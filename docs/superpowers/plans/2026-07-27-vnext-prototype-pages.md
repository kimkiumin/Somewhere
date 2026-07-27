# Somewhere vNext Prototype Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish only the six runnable files from `prototype/vnext/` as an explicitly labeled GitHub Pages prototype and verify the public site end to end.

**Architecture:** A repository-contract test locks the workflow name, branch trigger, permissions, action versions, and six-file allowlist. A single GitHub Actions job copies only those files into `_site`, uploads that directory as the Pages artifact, and deploys it to the `github-pages` environment; repository tests, README, v0.1, and all other project files stay outside the public artifact.

**Tech Stack:** Node.js built-in test runner, GitHub Actions, GitHub Pages official actions, GitHub CLI, `agent-browser.cmd`

## Global Constraints

- Deployment repository is `kimkiumin/Somewhere`.
- Deployment source branch is exactly `codex/vnext-sequence-prototype`.
- Expected public URL is `https://kimkiumin.github.io/Somewhere/`.
- Workflow name is exactly `Prototype — vNext Sequence`.
- Public artifact contains exactly `index.html`, `style.css`, `state.js`, `screens.js`, `controller.js`, and `app.js` from `prototype/vnext/`.
- Tests, README files, the historical v0.1 prototype, project documents, and any local or secret data must not enter the Pages artifact.
- Use `actions/checkout@v6`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`.
- The deployment job requires `contents: read`, `pages: write`, and `id-token: write` permissions and the `github-pages` environment.
- Keep pull request `#1` in draft state and do not merge it.
- Do not add a visible prototype badge inside the product canvas or change the approved product sequence.
- Do not change historical v0.1 files.

---

### Task 1: Lock and implement the isolated Pages artifact

**Files:**
- Create: `.github/workflows/vnext-prototype-pages.yml`
- Modify: `tests/project_contract.test.js`
- Modify: `prototype/vnext/README.md`

**Interfaces:**
- Consumes: the six existing relative-script browser files in `prototype/vnext/`
- Produces: `_site/` Pages artifact input containing the same six basenames and no other files
- Produces: GitHub Actions workflow `Prototype — vNext Sequence`

- [ ] **Step 1: Add the failing repository-contract test**

Append this test to `tests/project_contract.test.js`:

```js
test("vNext Pages workflow publishes only the runnable prototype files", () => {
  const workflow = read(".github/workflows/vnext-prototype-pages.yml");
  const runnableFiles = [
    "index.html",
    "style.css",
    "state.js",
    "screens.js",
    "controller.js",
    "app.js",
  ];

  assert.match(workflow, /^name: Prototype — vNext Sequence$/m);
  assert.match(workflow, /codex\/vnext-sequence-prototype/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment:\s*\n\s+name: github-pages/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: _site/);

  for (const file of runnableFiles) {
    assert.match(workflow, new RegExp(`prototype/vnext/${file.replace(".", "\\.")}`));
  }
  assert.doesNotMatch(workflow, /cp\s+[^\n]*prototype\/vnext\/\*/);
  assert.doesNotMatch(workflow, /path:\s*prototype\/vnext/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test tests/project_contract.test.js
```

Expected: FAIL because `.github/workflows/vnext-prototype-pages.yml` does not exist.

- [ ] **Step 3: Create the allowlist-only Pages workflow**

Create `.github/workflows/vnext-prototype-pages.yml` with exactly this structure:

```yaml
name: Prototype — vNext Sequence

on:
  push:
    branches:
      - codex/vnext-sequence-prototype
    paths:
      - prototype/vnext/index.html
      - prototype/vnext/style.css
      - prototype/vnext/state.js
      - prototype/vnext/screens.js
      - prototype/vnext/controller.js
      - prototype/vnext/app.js
      - .github/workflows/vnext-prototype-pages.yml
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Check out repository
        uses: actions/checkout@v6
      - name: Stage only runnable prototype files
        shell: bash
        run: |
          set -euo pipefail
          rm -rf _site
          mkdir _site
          files=(index.html style.css state.js screens.js controller.js app.js)
          for file in "${files[@]}"; do
            test -f "prototype/vnext/$file"
            cp -- "prototype/vnext/$file" "_site/$file"
          done
          test "$(find _site -maxdepth 1 -type f | wc -l)" -eq 6
      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5
      - name: Upload isolated prototype artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: _site
      - name: Deploy GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Document the public-prototype boundary**

Append this section to `prototype/vnext/README.md`:

```markdown
## GitHub Pages Prototype

The runnable prototype is published at <https://kimkiumin.github.io/Somewhere/> by the `Prototype — vNext Sequence` workflow. The Pages artifact contains only the six browser runtime files from this directory; tests, this README, project documents, and the historical v0.1 prototype are not published with the site.
```

- [ ] **Step 5: Run focused and full verification**

Run:

```powershell
node --test tests/project_contract.test.js
npm.cmd run verify
git diff --check
```

Expected: contract test and full suite pass with zero failures; prototype contract markers pass; whitespace check returns no errors.

- [ ] **Step 6: Inspect the staged artifact locally**

Run this PowerShell-only equivalent of the workflow staging step in a verified, uniquely named disposable directory under `$env:TEMP`:

```powershell
$tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
$stage = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ('somewhere-vnext-pages-check-' + [guid]::NewGuid())))
if (-not $stage.StartsWith($tempRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Disposable stage escaped the temp root'
}
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $files = @('index.html','style.css','state.js','screens.js','controller.js','app.js')
  foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path 'prototype/vnext' $file) -Destination (Join-Path $stage $file)
  }
  $published = Get-ChildItem -LiteralPath $stage -File | Select-Object -ExpandProperty Name | Sort-Object
  if (Compare-Object ($files | Sort-Object) $published) { throw 'Pages artifact allowlist mismatch' }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
```

Expected: no output and exactly six matching files.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- '.github/workflows/vnext-prototype-pages.yml' 'tests/project_contract.test.js' 'prototype/vnext/README.md'
git commit -m "ci: deploy isolated vnext prototype pages"
```

---

### Task 2: Enable, deploy, and verify GitHub Pages

**Files:**
- Modify: GitHub Pages repository setting for `kimkiumin/Somewhere`
- Modify: remote branch `codex/vnext-sequence-prototype`
- Modify: draft pull request `#1` body only

**Interfaces:**
- Consumes: committed workflow from Task 1
- Produces: Pages site with `build_type: workflow`
- Produces: public URL `https://kimkiumin.github.io/Somewhere/`

- [ ] **Step 1: Confirm clean publish scope and authentication**

Run:

```powershell
git status -sb
gh auth status
gh pr view 1 --json number,isDraft,baseRefName,headRefName,url
```

Expected: clean `codex/vnext-sequence-prototype` worktree, authenticated GitHub account, draft PR `#1` from the prototype branch into `codex/full-blueprint`.

- [ ] **Step 2: Enable Pages workflow mode before the triggering push**

First query the site:

```powershell
gh api 'repos/kimkiumin/Somewhere/pages'
```

If it returns 404, create it:

```powershell
gh api --method POST 'repos/kimkiumin/Somewhere/pages' -f build_type=workflow
```

If it exists with another build type, update it:

```powershell
gh api --method PUT 'repos/kimkiumin/Somewhere/pages' -f build_type=workflow
```

Expected: subsequent GET returns `build_type: workflow` and `html_url: https://kimkiumin.github.io/Somewhere/`. On an authorization or plan error, stop and report the exact GitHub response without changing hosting providers.

- [ ] **Step 3: Push the prototype branch without force**

Run:

```powershell
git push -u origin codex/vnext-sequence-prototype
```

Expected: remote branch advances to the local HEAD and the Pages workflow is queued.

- [ ] **Step 4: Watch the Pages workflow to completion**

Run:

```powershell
$run = gh run list --workflow 'vnext-prototype-pages.yml' --branch 'codex/vnext-sequence-prototype' --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json
if (-not $run) { gh workflow run 'vnext-prototype-pages.yml' --ref 'codex/vnext-sequence-prototype'; $run = gh run list --workflow 'vnext-prototype-pages.yml' --branch 'codex/vnext-sequence-prototype' --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json }
gh run watch $run.databaseId --exit-status
```

Expected: workflow exits successfully. If it fails, inspect `gh run view $run.databaseId --log-failed`, fix the scoped workflow problem, rerun verification, commit, push, and watch the replacement run once.

- [ ] **Step 5: Verify Pages metadata and public assets**

Run:

```powershell
$pages = gh api 'repos/kimkiumin/Somewhere/pages' | ConvertFrom-Json
if ($pages.build_type -ne 'workflow') { throw 'Pages is not using workflow mode' }
if ($pages.html_url -ne 'https://kimkiumin.github.io/Somewhere/') { throw "Unexpected Pages URL: $($pages.html_url)" }
$runtime = @('','style.css','state.js','screens.js','controller.js','app.js')
foreach ($asset in $runtime) {
  $uri = "https://kimkiumin.github.io/Somewhere/$asset"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 15
  if ($response.StatusCode -ne 200) { throw "Public asset failed: $uri" }
}
foreach ($privatePath in @('README.md','state.test.js','prototype/index.html')) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "https://kimkiumin.github.io/Somewhere/$privatePath" -TimeoutSec 15
    if ($response.StatusCode -eq 200) { throw "Non-runtime file was published: $privatePath" }
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
  }
}
```

Expected: root and five linked assets return 200; README, tests, and historical v0.1 probe return 404.

- [ ] **Step 6: Verify the public interaction in a real browser**

Load the current CLI workflow, then open the site:

```powershell
agent-browser.cmd skills get core
agent-browser.cmd --session somewhere-pages open 'https://kimkiumin.github.io/Somewhere/'
agent-browser.cmd --session somewhere-pages snapshot -i
```

Verify with fresh refs after every transition:

- page title is `Somewhere vNext 시퀀스 프로토타입`;
- `시작하기` opens constraints;
- the sole CTA `이 조건으로 바로 출발` enters finding and then following;
- CSS is applied and JavaScript state transitions work;
- `agent-browser.cmd --session somewhere-pages console` and `errors` are empty.

Keep the session open only if the user is actively viewing it; otherwise close it.

- [ ] **Step 7: Update the existing draft PR with the live URL and boundary**

Use `gh pr edit 1 --body` to preserve the existing context and add:

```markdown
## Live prototype

- GitHub Pages: https://kimkiumin.github.io/Somewhere/
- Deployment: `Prototype — vNext Sequence`
- Public artifact: only the six runtime files from `prototype/vnext/`
- Excluded: tests, README, v0.1, project documents, and repository-only evidence
```

Confirm the PR remains draft and targets `codex/full-blueprint`.

- [ ] **Step 8: Final remote verification**

Run:

```powershell
$local = git rev-parse HEAD
$remote = ((git ls-remote --heads origin codex/vnext-sequence-prototype) -split '\s+')[0]
if ($local -ne $remote) { throw 'remote prototype branch does not match local HEAD' }
gh pr view 1 --json number,isDraft,baseRefName,headRefName,url
gh run list --workflow 'vnext-prototype-pages.yml' --branch 'codex/vnext-sequence-prototype' --limit 1 --json status,conclusion,url
git status -sb
```

Expected: local and remote SHAs match; PR `#1` is still draft; latest workflow conclusion is `success`; worktree is clean.
