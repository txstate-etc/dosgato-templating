import { htmlEncode, isBlank, isNotEmpty } from 'txstate-utils'
import type { ContextBase, DataData, PageData, PageRecord, PageRecordOptionalData } from './component.js'
import type { AssetFolderLink, AssetLink, DataFolderLink, DataLink, LinkDefinition, PageLink } from './links.js'

/**
 * Safely encapsulates `content` in header tags based on the `ctx` context passed and adds any passed `attributes` to the header tagging.
 * If the headerLevel passed through `ctx` is outside the range of 1..6 the header tag generated is normalized to the nearest value of 1 or 6.
 * @returns An empty string if content is blank, undefined, or null - else an h<1..6> encapsulated content with attributes added to the encapsulating tag.
 * @example ```
 *   printHeader(this.renderCtx, htmlEncode(this.data.title), {class: 'some-extra-cssclass'})
 *   // Renders: '<h1 class="some-extra-cssclass">Title</h1>'
 * ``` */
export function printHeader (ctx: ContextBase, content: string | undefined | null, attributes?: Record<string, string>) {
  if (isBlank(content)) return ''
  const level = ctx.headerLevel ?? 1
  const attr = isNotEmpty(attributes) ? ' ' + Object.entries(attributes).map(([key, val]) => `${key}="${htmlEncode(val)}"`).join(' ') : ''
  if (level < 1) return `<h1${attr}>${content}</h1>`
  if (level > 6) return `<h6${attr}>${content}</h6>`
  return `<h${level}${attr}>${content}</h${level}>`
}

export function advanceHeader <T extends ContextBase> (ctx: T, content: string | undefined | null) {
  if (!isBlank(content)) ctx.headerLevel = (ctx.headerLevel ?? 1) + 1
  return ctx
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

export interface AssetRecord {
  id: string
  path: string
  checksum: string
  name: string
  extension: string
  filename: string
  mime: string
  size: number
  meta: any
  downloadLink: string
  image?: PictureAttributes
}

export interface DataRecord {
  id: string
  path: string
  name: string
  modifiedAt?: Date
  publishedAt?: Date
  data: DataData
}

export interface PageForNavigation {
  id: string
  name: string
  title: string
  path: string
  href: string
  publishedAt?: Date
  extra: Record<string, any>
  children: this[]
}

export interface APIClient {
  /**
   * Identify whether we are generating the page for live, preview, or editing
   *
   * Useful for things like google analytics where you only want to add it to live pages
   * or else you'd be getting stats from editors and previewers.
   */
  context: 'live' | 'preview' | 'edit'

  /**
   * Identify whether we are generating the published version of a page or not.
   *
   * The methods provided below all take this into account. For instance, if you are
   * generating the published view of a page and ask for its root page, you get
   * the published version of the root page, not the latest unpublished version.
   *
   * If you make your own queries asking for other pages' data, you should make use
   * of this variable to ensure you get the correct version of the data.
   */
  published: boolean

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
  resolveLink: (lnk: string | LinkDefinition | undefined, opts?: { absolute?: boolean, extension?: string }) => Promise<string | undefined>

  /**
   * Get a link href for a page
   *
   * By default this will generate relative links based on the page currently being rendered. Set
   * absolute: true to generate a full URL suitable for a backend http request or non-HTML document
   * like an RSS feed.
   *
   * Will be undefined for cross-site links to pages without launch info, since the resulting link would be
   * broken, but if a site has launch info that is simply disabled, getHref will still work. Any links generated
   * would work as soon as the launch info is enabled.
   */
  getHref: (page: PageRecordOptionalData, opts?: { absolute?: boolean, extension?: string }) => string | undefined

  /**
   * Get assets by link
   *
   * Certain components will be presenting download links for assets instead of showing images inline. In
   * those cases, you can use this function instead of getImgAttributes. The result you would get from
   * getImgAttributes will be inside the `image` property.
   *
   * It returns an array of assets because if you provide a link to an asset folder the result will be an
   * array. So if you provide an asset link you will just get an array of length 1. The recursive parameter
   * is available if you prefer to receive all assets that descend from the given folder instead of direct child
   * assets.
   *
   * Will be dataloaded so you can safely use this in a Promise.all.
   */
  getAssetsByLink: (link: AssetLink | AssetFolderLink | string, recursive?: boolean) => Promise<AssetRecord[]>

  /**
   * This function will retrieve information about an image to help you construct responsive HTML
   * for a <picture> element including the <img> and all <source> tags.
   *
   * The alt text it returns will be the default alternative text from the asset repository. Alt
   * text gathered from a template's dialog should generally take precedence (though the dialog may
   * preload the alt text field with the asset repository default).
   *
   * Will be dataloaded so you can safely use this in a Promise.all.
   */
  getImgAttributes: (link: string | AssetLink | undefined, absolute?: boolean) => Promise<PictureAttributes | undefined>

  /** Get the data for a specific page.
   *
   * Will be dataloaded.
   */
  getPage: ({ id, path, link }: { id?: string, path?: string, link?: string | PageLink }) => Promise<PageRecord<PageData> & { title: string } | undefined>

  /** Get all ancestor pages of a specific page. First array element will be the pagetree root page. */
  getAncestors: ({ id, path }: { id?: string, path?: string }) => Promise<PageRecord<PageData>[]>

  /** Get the pagetree root page from which the specified page descends. */
  getRootPage: ({ id, path }: { id?: string, path?: string }) => Promise<PageRecord<PageData>>

  /**
   * Get a hierarchical tree of pages suitable for generating a navigation UI for your template.
   *
   * Each element in the array is recursive such that any subpage descendants can be found by
   * traversing each element's respective `children` property.
   *
   * @param opts
   * ```
   *  { // Return pages beneath this path but not the page that is this path.
        // If `undefined` you will get back a single element array that
        // references the `PageForNaviation` of the root page of the pageTree.
        beneath? string

        // Relative to `beneath` this controls how many levels deep to fetch past
        // the top level set of results in the array. 0 returns the top level only
        // while n > 0 traverses n levels of children deep past the top level
        // results. Leave `undefined` to fetch all.
        depth?: number

        // Set to true to filter for only pages that are published. Else the default
        // of false will automatically not filter unpublished pages when in edit or
        // preview mode but will filter if in published mode.
        // WARNING:
        // If none of the pages in the current pageTree have been published and this is
        // set to `true` an error will be thrown as there will be no pages to return.
        published?: boolean

        // Array of strings that specify dot-separated object paths describing page
        // data not normally fetched within the PageForNavigation results. For example,
        // ['hideInNav'] would append the page record hideInNav value to the
        // `PageForNavigation.extra` property as its own sub-property `hideInNav` that
        // would normally be excluded from the `PageForNavigation` properties.
        extra?: string[]

        // Whether the href property in the returned records should be an absolute URL.
        absolute?: boolean
      }
      ``` */
  getNavigation: (opts?: {
    /**
     * Return pages beneath this path
     *
     * For instance, if you set this to '/site1' you will get back ['/site1/about',
     * '/site1/history', '/site1/history/traditions', ...etc] but you will NOT get
     * back the '/site1' page.
     *
     * If you do not set `beneath`, you will get back an array that contains only
     * the root page of the pagetree you are in.
     */
    beneath?: string
    /**
     * Return pages to the given depth
     *
     * This is relative to `beneath`, so if `beneath` is '/site1' and `depth` is 0 you
     * will get '/site1/history' and not '/site1/history/traditions'
     *
     * If you do not provide a `beneath`, `depth` 0 will get you the root page, 1 will get
     * you the root page and one level of subpages, etc.
     */
    depth?: number
    /**
     * Only return pages that are published. Setting this to true will ensure that the
     * page will appear the same in editing and preview views as it does in published
     * and live views.
     *
     * By default it is false, which means that in editing/preview context it shows
     * all pages, published and unpublished, but in published/live context it only shows
     * other published pages.
     */
    published?: boolean
    /**
     * Get extra data from the page data
     *
     * Returning the full page data for a whole tree of pages would be an extreme amount of
     * transfer, but if you need some of the data, you can specify an array of dot-separated
     * paths to retrieve from it.
     *
     * For example, ['hideInNav'] would get you the additional property `extra.hideInNav` in
     * each returned page record.
     */
    extra?: string[]
    /**
     * The `href` property in the returned records should be an absolute URL.
     */
    absolute?: boolean
  }) => Promise<PageForNavigation[]>

  /**
   * Get data entries by link or folder link
   *
   * Returns an array in case link is a DataFolderLink. If link is a DataLink, will return an
   * array with length <= 1. If link is a DataFolderLink to a DataRoot, returns all descendant data
   * recursively.
   *
   * Never returns deleted or unpublished data, and only returns the published version
   * of a piece of data, even in edit mode.
   */
  getDataByLink: (link: string | DataLink | DataFolderLink) => Promise<DataRecord[]>

  /**
   * Get data entries by full path including site
   *
   * Use '/global' for global data. If path refers to a specific data item, will return
   * an array with length <= 1. If path refers to a DataRoot, returns all descendant
   * data recursively.
   *
   * Never returns deleted or unpublished data, and only returns the published version
   * of a piece of data, even in edit mode.
   */
  getDataByPath: (templateKey: string, path: string) => Promise<DataRecord[]>
}
