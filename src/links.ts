/**
 * This is what an AssetLink should look like when stored in component data. It includes
 * lots of information so if the asset gets moved or recreated it may be possible to find
 * the link target anyway.
 */
export interface AssetLink {
  type: 'asset'
  source: string
  id: string // the asset's dataId
  siteId: string
  path: string
  checksum: string
}

/**
 * Some components (e.g. document list) can point at a folder instead of individual
 * assets, so we will want to track asset folders through moves, renames, and copies.
 * This link format supports all that.
 */
export interface AssetFolderLink {
  type: 'assetfolder'
  id: string // the asset folder's guid
  siteId: string
  path: string
}

/**
 * A page link always points at the same pagetree as the page the link is on.
 */
export interface PageLink {
  type: 'page'
  linkId: string
  siteId: string
  path: string
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
  id: string // the data item's dataId
  siteId: string|null // null if global data
  path: string
}

/**
 * Just like with asset folders, we may have components that point at data folders. We
 * would like to keep the links working through moves, renames, and copies.
 */
export interface DataFolderLink {
  type: 'datafolder'
  id: string // the asset folder's guid
  siteId?: string // null if global data
  path: string
}

export type LinkDefinition = AssetLink | AssetFolderLink | PageLink | WebLink | DataLink | DataFolderLink
