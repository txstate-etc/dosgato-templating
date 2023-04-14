import { htmlDecode } from 'txstate-utils'

/**
 * This is what an AssetLink should look like when stored in component data. It includes
 * lots of information so if the asset gets moved or recreated it may be possible to find
 * the link target anyway.
 */
export interface AssetLink {
  type: 'asset'
  source?: string
  id: string // the asset's linkId, or id from non-DosGato source
  siteId?: string // any of these last three properties could be undefined in a non-DosGato source
  path?: string
  checksum?: string
}

/**
 * Some components (e.g. document list) can point at a folder instead of individual
 * assets, so we will want to track asset folders through moves, renames, and copies.
 * This link format supports all that.
 */
export interface AssetFolderLink {
  type: 'assetfolder'
  source?: string
  id: string // the folder's linkId or a globally unique id from a non-DosGato source
  siteId?: string // may be undefined for non-DosGato source
  path: string
}

/**
 * A page link always points at the same pagetree as the page the link is on.
 */
export interface PageLink {
  type: 'page'
  siteId: string
  linkId: string
  path: string
}

/**
 * When looking up a page by linkId, the context matters. For instance, if I'm
 * gathering data to helps render a page that's in the same site as the target
 * page, I want to be sure to get the version of the page from the same pagetree.
 */
export interface PageLinkWithContext extends PageLink {
  context?: {
    pagetreeId: string
  }
}

/**
 * The link format for external webpages. This format seems a little extra since
 * it's just a URL string. Why does it need to be an object with a type? However,
 * components will often simply ask editors for a link, which could be a page, asset,
 * or external URL. Having them all in the same object format makes interpreting
 * the data a lot easier.
 */
export interface WebLink {
  type: 'url'
  url: string
}

/**
 * Many components will point at data records. That's the whole idea. Site id is
 * required for all data links, it just might be null when the data being pointed at is
 * global data.
 */
export interface DataLink {
  type: 'data'
  templateKey: string
  id: string // the data item's dataId
  siteId?: string // null if global data
  path: string
}

/**
 * Just like with asset folders, we may have components that point at data folders. We
 * would like to keep the links working through moves, renames, and copies.
 */
export interface DataFolderLink {
  type: 'datafolder'
  templateKey: string
  id: string // the asset folder's guid
  siteId?: string // null if global data
  path: string
}

export type LinkDefinition = AssetLink | AssetFolderLink | PageLink | WebLink | DataLink | DataFolderLink

const LinkRegex = /{.*"type"\s?:\s?"\w+".*?}/g
const HTMLEscapedLinkRegex = /{.*&quot;type&quot;\s?:\s?&quot;\w+&quot;.*?}/g

/**
 * This function is used by template definitions to help them identify links inside large blocks
 * of text and return them for indexing, and by render definitions to help replace them with the actual URLs.
 * @note This does not mean it finds raw links and converts them but that it finds and returns `LinkDefinition`
 * conformant object strings in the text and returns those. */
export function extractLinksFromText (text: string | undefined) {
  if (!text) return []
  const matches = Array.from(text.matchAll(LinkRegex)).map(m => JSON.parse(m[0]))
  const morematches = Array.from(text.matchAll(HTMLEscapedLinkRegex)).map(m => JSON.parse(htmlDecode(m[0])))
  return matches.concat(morematches) as LinkDefinition[]
}

/**
 * This function is used by render definitions to replace `LinkDefinition` conformant link object text in large
 * blocks with the actual URLs they point to at render time. */
export function replaceLinksInText (text: string, resolved: Map<string, string | undefined>) {
  return text.replace(LinkRegex, m => resolved.get(m) ?? 'dg-broken-link').replace(HTMLEscapedLinkRegex, m => resolved.get(htmlDecode(m)) ?? 'dg-broken-link')
}
