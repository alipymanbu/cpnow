// Import process and then mock exit
import process from 'node:process'
import { ofetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getGithubFiles } from '../src/sources/github'

// Mock consola
vi.mock('consola', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock process.exit after importing it
beforeEach(() => {
  vi.spyOn(process, 'exit').mockImplementation(() => {
    return undefined as never
  })
})

// Mock ofetch
vi.mock('ofetch', async () => ({
  ofetch: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gitHub Files', () => {
  it('should process a GitHub text file correctly', async () => {
    // Set up ofetch to return proper responses.
    (ofetch as any).mockImplementation((url: string) => {
      if (url.includes('/.gitignore'))
        return Promise.resolve('')
      if (/https:\/\/api.github.com\/repos\/org\/repo$/.test(url))
        return Promise.resolve({ default_branch: 'main' })
      if (url === 'https://api.github.com/repos/org/repo/git/trees/main?recursive=1')
        return Promise.resolve({ tree: [{ path: 'file.txt', type: 'blob' }] })
      if (url === 'https://raw.githubusercontent.com/org/repo/main/file.txt')
        return Promise.resolve('github file content')
      return Promise.resolve({})
    })

    const result = await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [])
    expect(result).toEqual([{ relativePath: 'file.txt', contents: 'github file content' }])
  })

  it('should process a GitHub binary file with empty content', async () => {
    (ofetch as any).mockImplementation((url: string) => {
      if (url.includes('/.gitignore'))
        return Promise.resolve('')
      if (/https:\/\/api.github.com\/repos\/org\/repo$/.test(url))
        return Promise.resolve({ default_branch: 'main' })
      if (url === 'https://api.github.com/repos/org/repo/git/trees/main?recursive=1')
        return Promise.resolve({ tree: [{ path: 'image.png', type: 'blob' }] })
      if (url === 'https://raw.githubusercontent.com/org/repo/main/image.png')
        return Promise.resolve('binary data')
      return Promise.resolve({})
    })

    const result = await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [])
    expect(result).toEqual([{ relativePath: 'image.png', contents: '' }])
  })
})

describe('gitHub Token Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should include token in request headers when provided', async () => {
    // Mock successful responses
    (ofetch as any).mockImplementation((url: string, _options: any) => {
      if (url.includes('/repos/org/repo'))
        return Promise.resolve({ default_branch: 'main' })
      if (url.includes('/.gitignore'))
        return Promise.resolve('')
      if (url.includes('/git/trees/main'))
        return Promise.resolve({ tree: [] })
      return Promise.resolve({})
    })

    const token = 'test-token-123'
    await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [], token)

    // Check that Authorization header was included in the API requests
    expect(ofetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
        }),
      }),
    )
  })

  it('should not include Authorization header when token is not provided', async () => {
    // Mock successful responses
    (ofetch as any).mockImplementation((url: string) => {
      if (url.includes('/repos/org/repo'))
        return Promise.resolve({ default_branch: 'main' })
      if (url.includes('/.gitignore'))
        return Promise.resolve('')
      if (url.includes('/git/trees/main'))
        return Promise.resolve({ tree: [] })
      return Promise.resolve({})
    })

    await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [])

    // Check that no Authorization header was included
    expect(ofetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    )
  })

  it('should handle rate limit errors properly', async () => {
    // Mock a rate limit error response
    const rateLimitError = {
      status: 403,
      statusText: 'API rate limit exceeded',
    }

    // Mock ofetch to reject with rate limit error
    vi.mocked(ofetch).mockRejectedValueOnce(rateLimitError)

    // This would normally exit the process, but we've modified the code to return [] for testing
    const result = await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [])

    // Verify that we got an empty array (our testing accommodation)
    expect(result).toEqual([])

    // Check that process.exit was called with code 1
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('should handle authentication errors properly', async () => {
    // Mock an authentication error
    const authError = {
      status: 401,
      statusText: 'Unauthorized',
    }

    // Mock ofetch to reject with auth error
    vi.mocked(ofetch).mockRejectedValueOnce(authError)

    // This would normally exit the process, but we've modified the code to return [] for testing
    const result = await getGithubFiles({ org: 'org', repo: 'repo', path: '' }, [], 'invalid-token')

    // Verify that we got an empty array (our testing accommodation)
    expect(result).toEqual([])

    // Check that process.exit was called with code 1
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
