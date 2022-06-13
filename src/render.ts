import { isBlank } from 'txstate-utils'
import { ContextBase } from './component'

export function printHeader (ctx: ContextBase, content: string) {
  if (isBlank(content)) return ''
  const level = (ctx.headerLevel ?? 0) + 1
  if (level < 1) return `<h1>${content}</h1>`
  if (level > 6) return `<h6>${content}</h1>`
  return `<h${level}>${content}</h${level}>`
}

export function advanceHeader (ctx: ContextBase, content?: string) {
  const ret = { ...ctx }
  if (!isBlank(content)) ret.headerLevel = (ret.headerLevel ?? 0) + 1
  return ret
}
