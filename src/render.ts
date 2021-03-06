import { isBlank } from 'txstate-utils'
import { ContextBase, DataData, PageData, PageRecord } from './component.js'
import { AssetLink, DataFolderLink, DataLink, LinkDefinition, PageLink } from './links.js'

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

export interface PictureResize {
  /** the width of this particular resize */
  width: number
  /** the URL to this particular resize, relative or absolute depends on options used */
  src: string
}

export interface PictureAttributes {
  /** string appropriate for the src attribute of the default <img> tag */
  src: string
  /** string appropriate for the srcset attribute of the default <img> tag, or use widths array to reconstruct */
  srcset: string
  /** a list of available widths in case you want to filter some out and recreate the srcset */
  widths: PictureResize[]
  /** alternative text stored with the image in its asset repository, may be overridden by local alt text */
  alt?: string
  /** the original intrinsic width of the image uploaded by the editor */
  width: number
  /** the original intrinsic height of the image uploaded by the editor */
  height: number
  /** a list of alternate formats like AVIF or WEBP and their resizes, useful for creating <source> tags */
  alternates: {
    /** the mime type of this alternate source, useful for the type attribute on a <source> tag */
    mime: string
    /** the full srcset for the <source> tag, or use widths array to reconstruct */
    srcset: string
    /** a list of available widths in case you want to filter some out and recreate the srcset */
    widths: PictureResize[]
  }[]
}

export interface APIClient {
  /**
   * Run any query against the API.
   *
   * Will be authenticated as appropriate - anonymous during published renders, as the editor
   * during preview renders.
   */
  query: <T = any>(query: string, variables?: any) => Promise<T>

  /**
   * This function will be provided by the rendering server and should be used inside your fetch
   * method to convert a link, as input by a user, into a URL suitable for an href, or optionally
   * an absolute URL suitable for a backend http request or non-HTML document like an RSS feed.
   */
  resolveLink: (link: string | LinkDefinition, absolute?: boolean) => Promise<string>

  /**
   * This function will be provided by the rendering server and should be used inside your fetch
   * method to prepare editor-provided HTML for rendering. It will do things like find and resolve
   * link definitions in the internal dosgato format and clean up tags that were accidentally left
   * open to protect overall page integrity.
   */
  processRich: (text: string) => Promise<string>

  /**
   * This function will retrieve information about an image to help you construct responsive HTML
   * for a <picture> element including the <img> and all <source> tags.
   *
   * The alt text it returns will be the default alternative text from the asset repository. Alt
   * text gathered from a template's dialog should generally take precedence (though the dialog may
   * preload the alt text field with the asset repository default).
   *
   * Will be dataloaded.
   */
  getImgAttributes: (link: string | AssetLink, absolute?: boolean) => Promise<PictureAttributes>

  /** Get the data for a specific page.
   *
   * Will be dataloaded.
   */
  getPage: ({ id, path, link }: { id?: string, path?: string, link?: string | PageLink }) => Promise<PageRecord<PageData> | undefined>

  /** Get all ancestor pages of a specific page. First array element will be the pagetree root page. */
  getAncestors: ({ id, path }: { id?: string, path?: string }) => Promise<PageRecord<PageData>[]>

  /** Get the pagetree root page from which the specified page descends. */
  getRootPage: ({ id, path }: { id?: string, path?: string }) => Promise<PageRecord<PageData>>

  /**
   * Get data entries by link or folder link
   *
   * Returns an array in case link is a DataFolderLink. If link is a DataLink, will return an
   * array with length <= 1.
   */
  getDataByLink: (link: string | DataLink | DataFolderLink) => Promise<DataData[]>

  /**
   * Get data entries by full path including site
   *
   * Use '/global' for global data. If path refers to a specific data item, will return
   * an array with length <= 1.
   */
  getDataByPath: (templateKey: string, path: string) => Promise<DataData[]>
}
