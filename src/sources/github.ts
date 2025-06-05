import type { Source } from '../types'
import process from 'node:process'
import consola from 'consola'
import { ofetch } from 'ofetch'
import { getIgnorer, isTextBased } from '../utils'

export interface GitHubRef {
  org: string
  repo: string
  path: string
}

export async function getGithubFiles(ref: GitHubRef, extraIgnore: string[], token?: string): Promise<Source[]> {
  const ig = getIgnorer()

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const repoInfo = await ofetch(`https://api.github.com/repos/${ref.org}/${ref.repo}`, {
      responseType: 'json',
      headers,
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
      { responseType: 'json', headers },
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
  catch (error: any) {
    if (error?.status === 403 && error?.statusText?.includes('rate limit')) {
      consola.error('GitHub API rate limit exceeded.')
      consola.info('To increase your rate limits, provide a GitHub token using:')
      consola.info('  --token YOUR_GITHUB_TOKEN')
      consola.info('  or set the GITHUB_TOKEN environment variable')
      consola.info('Learn more: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting')
      process.exit(1)
      // This line is never reached in normal execution but helps with testing
      return []
    }
    if (error?.status === 401) {
      consola.error('GitHub API authentication failed. Check your token.')
      process.exit(1)
      // This line is never reached in normal execution but helps with testing
      return []
    }
    throw error
  }
}
