#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const eventName = process.env.GITHUB_EVENT_NAME
const eventPath = process.env.GITHUB_EVENT_PATH
const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const model = process.env.MODEL || 'opencode/deepseek-v4-flash-free'
const botLogin = process.env.BOT_LOGIN || 'takanashi-hoshino-agent[bot]'

if (!eventPath || !token || !repo) {
  console.error(
    'Missing required env: GITHUB_EVENT_PATH / GITHUB_TOKEN / GITHUB_REPOSITORY',
  )
  process.exit(1)
}
if (!process.env.OPENCODE_API_KEY) {
  console.error('Missing OPENCODE_API_KEY')
  process.exit(1)
}

const event = JSON.parse(readFileSync(eventPath, 'utf8'))
const [owner, repoName] = repo.split('/')
const api = `https://api.github.com/repos/${owner}/${repoName}`
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'opencode-automation',
}

async function get(path) {
  const res = await fetch(`${api}${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST ${path}: HTTP ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/** 无头模式跑 opencode，返回模型输出的文本 */
function runOpencode(prompt, contextFile) {
  const args = ['run', '--auto', '-m', model, '--format', 'default', prompt]
  if (contextFile) args.push('-f', contextFile)
  console.log(
    `Running: opencode run --auto -m ${model} (prompt ${prompt.length} chars${contextFile ? ', context attached' : ''})`,
  )
  const res = spawnSync('opencode', args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (res.error) throw res.error
  if (res.status !== 0) {
    if (res.stderr) console.error('opencode stderr:\n' + res.stderr)
    throw new Error(`opencode exited with code ${res.status}`)
  }
  return (res.stdout || '').trim()
}

/** 该 issue/PR 是否已有 bot 评论（用于去重，避免 synchronize 重复评论） */
async function hasBotComment(target) {
  const comments = await get(`/issues/${target}/comments?per_page=100`)
  return comments.some((c) => c.user?.login === botLogin)
}

async function comment(target, body) {
  if (!body) {
    console.log('No output from agent, skip comment')
    return
  }
  if (body.length > 60000) body = body.slice(0, 60000) + '\n\n_...(truncated)_'
  await post(`/issues/${target}/comments`, { body })
  console.log(`Commented on #${target}`)
}

async function handleIssue(issue) {
  const n = issue.number
  console.log(`Handling issue #${n}`)
  if (await hasBotComment(n)) {
    console.log(`Already handled by bot, skip`)
    return
  }

  const comments = await get(`/issues/${n}/comments?per_page=100`)
  const thread = comments
    .filter((c) => c.user?.login !== botLogin)
    .map(
      (c) =>
        `- **${c.user?.login}** (${c.created_at}):\n  ${(c.body || '').replace(/\n/g, '\n  ')}`,
    )
    .join('\n')

  const ctx = [
    `# Issue #${n}: ${issue.title}`,
    ``,
    `- State: ${issue.state}`,
    `- Author: ${issue.user?.login}`,
    `- Created: ${issue.created_at}`,
    ``,
    `## Body`,
    ``,
    issue.body || '(empty)',
    ...(thread ? [`\n## Comments\n\n${thread}`] : []),
  ].join('\n')

  const ctxFile = join(tmpdir(), 'opencode-issue-context.md')
  writeFileSync(ctxFile, ctx)

  const prompt =
    process.env.ISSUE_PROMPT ||
    [
      `You are a maintainer bot for the ${repo} repository.`,
      `Read the attached file for the issue context.`,
      `If the issue has a clear fix or points to relevant docs, reply with documentation links and/or`,
      `error-handling guidance for code examples. If nothing actionable, reply with exactly "NO_ACTION".`,
      `Do NOT modify any files, do NOT commit, do NOT push. Output only the comment text.`,
    ].join('\n')

  const output = runOpencode(prompt, ctxFile)
  if (output === 'NO_ACTION' || output.startsWith('NO_ACTION')) {
    console.log('Agent decided no action needed')
    return
  }
  await comment(n, output)
}

async function handlePullRequest(pr) {
  const n = pr.number
  console.log(`Handling PR #${n}`)
  if (await hasBotComment(n)) {
    console.log(`Already handled by bot, skip`)
    return
  }

  let files = []
  try {
    files = await get(`/pulls/${n}/files?per_page=100`)
  } catch (e) {
    console.warn(`Failed to fetch changed files: ${e.message}`)
  }
  const fileList = files
    .map((f) => `- ${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n')

  const ctx = [
    `# PR #${n}: ${pr.title}`,
    ``,
    `- State: ${pr.state}`,
    `- Author: ${pr.user?.login}`,
    `- Base: ${pr.base?.ref} <- Head: ${pr.head?.ref}`,
    `- Created: ${pr.created_at}`,
    `- Stats: +${pr.additions}/-${pr.deletions}, ${pr.changed_files} files`,
    ``,
    `## Body`,
    ``,
    pr.body || '(empty)',
    ...(fileList ? [`\n## Changed files\n\n${fileList}`] : []),
  ].join('\n')

  const ctxFile = join(tmpdir(), 'opencode-pr-context.md')
  writeFileSync(ctxFile, ctx)

  const prompt =
    process.env.PR_PROMPT ||
    [
      `You are a maintainer bot for the ${repo} repository.`,
      `Read the attached file for the PR context. The PR branch is already checked out.`,
      `Run \`git diff HEAD^1 HEAD\` (or \`git diff origin/${pr.base?.ref}...HEAD\`) to see the changes.`,
      `Review the code changes: point out bugs, risks and improvements, and suggest fixes for obvious issues.`,
      `If the PR looks good, say so concisely.`,
      `Do NOT modify any files, do NOT commit, do NOT push. Output only the review comment text.`,
    ].join('\n')

  const output = runOpencode(prompt, ctxFile)
  await comment(n, output)
}

async function main() {
  console.log(`Event: ${eventName} on ${repo}`)
  if (eventName === 'issues') {
    await handleIssue(event.issue)
  } else if (eventName === 'pull_request') {
    await handlePullRequest(event.pull_request)
  } else {
    console.log(`Unhandled event type: ${eventName}`)
  }
}

main().catch((e) => {
  console.error(`Automation failed: ${e.message}`)
  process.exit(1)
})
