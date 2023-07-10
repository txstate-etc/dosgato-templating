import { lookup } from 'mime-types'

export function makeSafeFilename (str: string) {
  const extFromFileName = str.match(/\.(\w+)$/)?.[1]
  if (extFromFileName && lookup(extFromFileName)) str = str.replace(/\.(\w+)$/, '')
  return str.normalize('NFKD').replace(/[^. _a-z0-9-]/ig, '').replace(/\s+/g, ' ').trim()
}

export function makeFilenamePathSafe (path: string) {
  const parts = path.split('/')
  return [...parts.slice(0, -1).map(makeSafe), makeSafeFilename(parts[parts.length - 1])].join('/')
}

export function makePathSafe (path: string) {
  return path.split('/').map(makeSafe).join('/')
}

export function makeSafe (str: string) {
  return str.normalize('NFKD').toLocaleLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-/, '').replace(/-$/, '')
}
