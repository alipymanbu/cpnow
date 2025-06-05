import type { Source } from '../types'
import consola from 'consola'
import { ofetch } from 'ofetch'
import { getIgnorer, isTextBased } from '../utils'

export interface GitHubRef {
  org: string
  repo: string
  path: string
}

export async function getGithubFiles(ref: GitHubRef, extraIgnore: string[]): Promise<Source[]> {
  const ig = getIgnorer()

  const repoInfo = await ofetch(`https://api.github.com/repos/${ref.org}/${ref.repo}`, {
    responseType: 'json',
  })
  const branch = repoInfo.default_branch || 'main'

  try {
    const gitignore = await ofetch(
      `https://raw.githubusercontent.com/${ref.org}/${ref.repo}/${branch}/.gitignore`,
      { responseType: 'text' },
    )
    ig.add((gitignore as string).split('\n'))
  }
  // eslint-disable-next-line unused-imports/no-unused-vars
  catch (e) {
    // .gitignore not found; continue
  }
  if (extraIgnore.length > 0) {
    ig.add(extraIgnore)
  }

  const treeRes = await ofetch(
    `https://api.github.com/repos/${ref.org}/${ref.repo}/git/trees/${branch}?recursive=1`,
    { responseType: 'json' },
  )
  let files = (treeRes.tree || []).filter((f: any) => f.type === 'blob')

  if (ref.path) {
    files = files.filter((f: { path: string }) => f.path.startsWith(ref.path))
  }

  const results = []
  for (const file of files) {
    const path = file.path
    if (ig.ignores(path))
      continue
    let contents = ''
    if (isTextBased(path)) {
      contents = await ofetch(
        `https://raw.githubusercontent.com/${ref.org}/${ref.repo}/${branch}/${path}`,
        { responseType: 'text' },
      ) as string
      consola.info(`Fetched ${path}`)
    }
    else {
      consola.info(`Skipped downloading non-text file ${path}`)
    }
    results.push({
      relativePath: path,
      contents,
    })
  }
  return results
}
