import type { IncomingHttpHeaders } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import { get, isNotBlank } from 'txstate-utils'
import { ResourceProvider } from './provider.js'
import { APIClient } from './render.js'

function defaultWrap (info: RenderComponentsWrapParams) { return info.output }

/**
 * This is the primary templating class to build your templates. Subclass it and provide
 * at least a render function.
 *
 * During rendering, it will be "hydrated" - placed into a full page structure with its
 * parent and child components linked.
 */
export abstract class Component<DataType extends ComponentData = any, FetchedType = any, RenderContextType extends ContextBase = ContextBase> extends ResourceProvider {
  /**
   * Provide this when you create a template to identify what you are defining.
   */
  static templateKey: string

  /**
   * The rendering server will provide an instance of the APIClient interface so that
   * you can run any API GraphQL query you like in your `fetch` function. There are also
   * some useful methods there like processRich to help you convert links in rich text
   * strings.
   *
   * Do NOT mutate data received from the API as it may be cached and given to other
   * Component instances that run the same type of query.
   */
  api!: APIClient

  /**
   * This property will be set during page render and you may refer to it at any time to
   * determine whether you are doing your work in edit mode or regular rendering mode.
   * The editBar and newBar methods will automatically use it to blank out the editing UI.
   */
  editMode: boolean

  /**
   * When hydrating an inherited component, the renderer will set this to the id of the page it
   * came from. You may use this information in any of the phases to alter your behavior if needed.
   *
   * For instance, you may decide that your fetch function needs some extra information from the
   * originating page instead of the page you're being inherited into (your `this.page` will
   * be the page currently being rendered, NOT the page the inheritable component came from).
   *
   * This property is also used to alter the edit bar. Inherited components may never be edited
   * except on their original page, so the edit bar will render with a link to the original page.
   */
  inheritedFrom?: string

  /**
   * The first phase of rendering a component is the fetch phase. Each component may
   * provide a fetch method that looks up data it needs from external sources. This step
   * is FLAT - it will be executed concurrently for all the components on the page for
   * maximum speed.
   *
   * Place any needed data into the return object, and it will be available to you as `this.fetched`
   * during the rendering phase.
   *
   * Note that `this.page` will be available, and `this.api` has dataloaded methods for retrieving
   * data from the API if, for instance, you need to inherit information from a parent or root
   * page. If you need to inherit and render entire components from ancestor pages,
   * you must register them. See the comment for `this.registerInherited`
   *
   * Try to minimize the number of round trips you make here, make use of Promise.all and such;
   * remember that the api functions are mostly dataloaded so calling them simultaneously is
   * advantageous where possible.
   */
  async fetch (): Promise<FetchedType> {
    return undefined as unknown as FetchedType
  }

  /**
   * Some components may be inheritable to subpages within the same site. For instance, a site's
   * social media links may appear on every page's footer. To accomplish this in your template,
   * you need to fetch ancestor page data in your fetch phase, identify the component data you want
   * to inherit, and then call this function within your fetch to let the renderer know it needs to
   * process those components (hydrate them, call their fetch functions, and include them in the render).
   *
   * The inherited components will be added to the appropriate area's array in the renderedAreas
   * parameter of your render function.
   */
  registerInherited!: (
    /**
     * The area in which to place the inherited components. It doesn't matter where you found them.
     */
    area: string,
    /**
     * An array of components to add to the area.
     */
    components: ComponentData[] | undefined,
    /**
     * The page id of the page these components came from.
     *
     * If you are providing components from different pages, you may pass an array
     * that corresponds index-for-index with the components array you provided.
     *
     * Generally you would only need to do this when you are using 'replace' mode, as with
     * 'top' or 'bottom' you could just call registerInherited once per page you're
     * inheriting from.
     */
    fromPageId: string | string[],
    /**
     * How to place the inherited components into the area.
     *
     * 'top' to place these inherited components at the top of the area.
     * 'bottom' to place them at the bottom of the area.
     * 'replace' to remove all existing components (inherited or not) in the area and
     * use these instead.
     *
     * Default is 'top'.
     */
    mode?: 'top' | 'bottom' | 'replace'
  ) => void

  /**
   * Inherit components from another page with matching area
   *
   * This is a convenience function for when you are inheriting components from
   * the exact same area on another page. It will not cover all inheritance use
   * cases, but it covers enough that having this as a shorthand is helpful.
   *
   * Call it in your fetch() method just like you would with registerInherited.
   *
   * Note that you can still provide `mode` and you can provide a `filter` function
   * to reduce the number of components that get inherited.
   */
  inheritArea <T extends ComponentData> (page: PageRecord, areaName: string, opts?: { mode?: 'top' | 'bottom' | 'replace', filter?: (c: T) => boolean }) {
    const components = get(page.data, `areas.${areaName}`).filter(opts?.filter ?? (() => true))
    this.registerInherited(areaName, components, page.id, opts?.mode)
  }

  /**
   * The second phase of rendering a component is the context phase. This step is TOP-DOWN.
   * Each component will receive context from the parent component and then pass a new context
   * object to its own children.
   *
   * This is useful for rendering logic that is sensitive to where the component exists in
   * the hierarchy of the page. For instance, if a parent component has used an h2 header
   * already, it will want to inform its children so that they can use h3 next, and they inform
   * their children that h4 is next, and so on. (Header level tracking is supported by default in
   * dosgato CMS - see printHeader() and advanceHeader())
   *
   * This function may return a promise in case you need to do something asynchronous based on
   * the context received from the parent, but use it sparingly since it will stall the process.
   * Try to do all asynchronous work in the fetch phase.
   */
  setContext (renderCtxFromParent: RenderContextType, areaName: string): RenderContextType | Promise<RenderContextType> {
    return renderCtxFromParent
  }

  /**
   * This function will be provided by the rendering server and should be used inside your fetch
   * method to prepare editor-provided HTML for later rendering. It will do things like find and
   * resolve link definitions in the internal dosgato format.
   */
  fetchRichText!: (text: string) => Promise<void>

  /**
   * This function will be provided by the rendering server and should be used during the render
   * phase to clean up editor-provided HTML. It will do things like clean up tags that were accidentally
   * left open to protect overall page integrity, and fix header levels for accessibility.
   *
   * For instance, an editor supplies a title to be placed above some rich editor content. The
   * title uses an <h2>, so the headers inside the rich editor content should start at <h3> and
   * should not use <h1> or <h2>.
   *
   * Setting headerLevel: 3 instructs the renderRichText function to analyze and rebalance the header
   * structure of the content so that if it had an h2, it woud be replaced with an h3. Additionally,
   * if the user skipped a header level (a WCAG violation) that situation will be repaired as well
   * as possible.
   *
   * If you do not provide a headerLevel, the one from `this.renderCtx` will be used. However, if you
   * provide a non-blank value for `advanceHeader`, the headerLevel from `this.renderCtx` + 1 will be used.
   *
   * This way you can easily render a piece of rich text in a component that has an optional title:
   *
   * this.renderRichText(this.data.richtext, { advanceHeader: this.data.title })
   *
   * If this.data.title is non-blank, the rich text will be balanced below it, but if it is blank,
   * it will be balanced at the level the title would have had.
   */
  renderRichText!: (html: string, opts?: { headerLevel?: number, advanceHeader?: string | undefined | null }) => string

  /**
   * The final phase of rendering a component is the render phase. This step is BOTTOM-UP -
   * components at the bottom of the hierarchy will be rendered first, and the result of the
   * render will be passed to parent components so that the HTML can be included during the
   * render of the parent component.
   */
  abstract render (): string

  /**
   * Sometimes pages are requested with an alternate extension like .rss or .ics. In these
   * situations, each component should consider whether it should output anything. For
   * instance, if the extension is .rss and a component represents an article, it should
   * probably output an RSS item. If you don't recognize the extension, just return
   * super.renderVariation(extension, renderedAreas) to give your child components a chance to
   * respond, or return empty string if you want your child components to be silent in all
   * cases.
   *
   * This function will be run after the fetch phase. The context and html rendering phases
   * will be skipped.
   */
  renderVariation (extension: string) {
    return Array.from(this.renderedAreas.values()).flatMap(ras => ras.map(ra => ra.output)).join('')
  }

  /**
   * helper function to print an area's component list, but you can also override this if you
   * need to do something advanced
   */
  renderComponents (components: RenderedComponent[] | string = [], opts?: RenderComponentsOpts) {
    if (!Array.isArray(components)) components = this.renderedAreas.get(components) ?? []
    const wrap = opts?.wrap ?? defaultWrap
    if (opts?.skipBars || opts?.skipEditBars) return components.map((c, indexInArea) => wrap({ ...c, content: c.output, bar: '', indexInArea })).join('')
    return components
      .map((c, indexInArea) => {
        if (c.component.inheritedFrom && opts?.hideInheritBars) {
          return opts.skipContent ? '' : wrap({ ...c, content: c.output, bar: '', indexInArea })
        } else {
          const bar = c.component.editBar({
            ...opts?.editBarOpts,
            label: typeof opts?.editBarOpts?.label === 'function' ? opts.editBarOpts.label(c.component) : opts?.editBarOpts?.label,
            extraClass: typeof opts?.editBarOpts?.extraClass === 'function' ? opts.editBarOpts.extraClass(c.component) : opts?.editBarOpts?.extraClass
          })
          return wrap({ output: bar + c.output, content: c.output, bar, component: c.component, indexInArea })
        }
      }).join('')
  }

  /**
   * helper function to print an area and set a minimum or maximum number of components
   *
   * In some cases you might be rendering the edit bars in a separate div instead of placing
   * them above each component. For instance, a slider that only shows one slide at a time may
   * prefer not to put bars with slides because that would mean only one bar is visible at a time
   * and then there's no way to re-order slides.
   *
   * In that case you would call this.renderArea('areaname', { ..., skipEditBars: true }) first
   * and then this.renderArea('areaname', { ..., skipContent: true }) in another place.
   */
  renderArea (areaName: string, opts?: RenderAreaOpts) {
    const components = this.renderedAreas.get(areaName) ?? []
    const ownedComponentCount = components.filter(c => !c.component.inheritedFrom).length
    const full = !!(opts?.max && ownedComponentCount >= opts.max)
    const wrap = opts?.wrap ?? defaultWrap
    let output = this.renderComponents(components, { ...opts, editBarOpts: { ...opts?.editBarOpts, disableDelete: ownedComponentCount <= (opts?.min ?? 0), disableDrop: full } })
    if (!opts?.skipBars && !opts?.skipNewBar) {
      let bar: string | undefined
      if (full) {
        if (!opts.hideMaxWarning) {
          bar = this.newBar(areaName, { ...opts.newBarOpts, label: opts.maxWarning ?? 'Maximum Reached', disabled: true })
        }
      } else {
        bar = this.newBar(areaName, opts?.newBarOpts)
      }
      if (bar != null) output += wrap({ output: bar, content: '', bar, indexInArea: components.length })
    }
    return output
  }

  /**
   * During rendering, each component should determine the CSS blocks that it needs. This may
   * change depending on the data. For instance, if you need some CSS to style up an image, but
   * only when the editor uploaded an image, you can check whether the image is present during
   * the execution of this function.
   *
   * This is evaluated after the fetch and context phases but before the rendering phase. If you
   * need any async data to make this determination, be sure to fetch it during the fetch phase.
   *
   * You should check `this.editMode` if you need to load CSS that alters edit bars.
   */
  cssBlocks (): string[] {
    return Array.from((this.constructor as any).cssBlocks.keys())
  }

  /**
   * Same as cssBlocks() but for javascript.
   */
  jsBlocks (): string[] {
    return Array.from((this.constructor as any).jsBlocks.keys())
  }

  /**
   * Components may override this function to give their edit bars a custom
   * label instead of using the template name
   *
   * For instance, you could return this.data.title
   */
  editLabel (): string | undefined { return undefined }

  /**
   * Components may override this function to give their edit bars a custom
   * CSS class
   */
  editClass (): string | undefined { return undefined }

  /**
   * Override with `true` to indicate that this template never accepts data from editors
   *
   * Its edit bar will not have a pencil icon.
   */
  noData = false

  /**
   * Components may override this function to give their new bars a custom
   * label
   *
   * For instance, an area that only accepts 'layout' components could
   * return "Add Layout"
   */
  newLabel (areaName: string): string | undefined { return undefined }

  /**
   * Components may override this function to give their new bars a custom
   * CSS class
   */
  newClass (areaName: string): string | undefined { return undefined }

  /**
   * Components may override this function to provide a custom edit bar
   *
   * Generally should not be overridden - override editLabel and editClass instead
   */
  editBar (opts: EditBarOpts = {}) {
    const options = { ...opts }
    options.label ??= this.editLabel() ?? this.autoLabel
    options.extraClass = [options.extraClass, this.editClass()].filter(isNotBlank).join(' ')
    options.editMode ??= this.editMode
    options.inheritedFrom ??= this.inheritedFrom
    options.hideEdit = this.noData || options.hideEdit
    return Component.editBar(this.path, options)
  }

  /**
   * Components may override this function to provide a custom new bar
   *
   * Generally should not be overridden - override newLabel and newClass instead
   */
  newBar (areaName: string, opts: NewBarOpts = {}) {
    const options = { ...opts }
    options.label ??= this.newLabel(areaName) ?? (this.areas.size > 1 ? `Add ${areaName} Content` : `Add ${this.autoLabel} Content`)
    options.extraClass = [options.extraClass, this.newClass(areaName)].filter(isNotBlank).join(' ')
    options.editMode ??= this.editMode
    return Component.newBar([this.path, 'areas', areaName].filter(isNotBlank).join('.'), options)
  }

  /**
   * These functions will be provided by the rendering server to assist in the
   * rendering process.
   */
  static editBar: (path: string, opts: EditBarOpts) => string
  static newBar: (path: string, opts: NewBarOpts) => string

  // the constructor is part of the recursive hydration mechanism: constructing
  // a Component will also construct/hydrate all its child components
  constructor (data: DataType, path: string, parent: Component | undefined, editMode: boolean) {
    super()
    this.editMode = editMode
    this.parent = parent
    const { areas, ...ownData } = data
    this.data = ownData
    this.path = path
    this.hadError = false
    let tmpParent = this.parent ?? this
    while (!(tmpParent instanceof Page) && tmpParent.parent) tmpParent = tmpParent.parent
    if (!(tmpParent instanceof Page)) throw new Error('Hydration failed, could not map component back to its page.')
    this.page = tmpParent
  }

  // Properties provided during the rendering process. You do not have to provide these when
  // building a template, but you can use them in the functions you do provide
  areas = new Map<string, Component[]>() // a Map of area names and the array of hydrated components in each
  data: Omit<DataType, 'areas'> // the component data
  fetched!: FetchedType // where we store the output from your `fetched` method
  renderCtx!: RenderContextType // where we store the output from your `setContext` method
  path: string // the dot-separated path to this component within the page data
  parent?: Component // the hydrated parent component of this component
  page?: Page // the hydrated page component this component lives in
  renderedAreas!: Map<string, RenderedComponent[]> // render server sets this just before `render` is called
  hadError: boolean // will be true if the fetch encountered an error, render will be skipped
  autoLabel!: string // the rendering server will fetch template names and fill this
  reqHeaders!: IncomingHttpHeaders // the HTTP headers of the request being processed, in case it would change the render
  reqQuery!: ParsedUrlQuery // the URL of the request being processed, so you can access the query or do routing work
  // the index of this component in its area, after inheritance has occurred
  // because we are waiting for inheritance, this will be undefined until the render phase
  // it's also undefined for page templates but I'm intentionally making it non-optional
  // because it would be non-sensical to try to use in a page template anyway
  indexInArea!: number

  /**
   * For logging errors during rendering without crashing the render. If your fetch, setContext,
   * render, or renderVariation functions throw, the error will be logged but the page render will
   * continue. You generally do not need to use this function, just throw when appropriate.
   */
  logError (e: Error) {
    this.hadError = true
    this.passError(e, this.path)
  }

  // helper function for recursively passing the error up until it reaches the page
  protected passError (e: Error, path: string) {
    this.parent?.passError(e, path)
  }
}

export interface SiteInfo {
  id: string
  name: string
  launched: boolean
  url?: {
    prefix: string
    path: string
  }
}

export interface PageRecord<DataType extends PageData = PageData> {
  id: string
  linkId: string
  createdAt: Date
  modifiedAt: Date
  publishedAt?: Date
  path: string
  data: DataType
  site: SiteInfo
}

export interface PageRecordOptionalData<DataType extends PageData = PageData> extends Omit<PageRecord<DataType>, 'data'> {
  data?: DataType
}

export interface ComponentData {
  templateKey: string
  areas?: Record<string, ComponentData[]>
  [keys: string]: any
}

export interface PageData extends ComponentData {
  savedAtVersion: string
}

export interface DataData {
  templateKey: string
  savedAtVersion: string
  [keys: string]: any
}

export interface ContextBase {
  /**
   * For accessibility, every component should consider whether it is creating headers
   * using h1-h6 tags, and set the context for its children so that they will use the
   * next higher number. For example, a page component might use h1 for the page title,
   * in which case it should set headerLevel: 2 so that its child components will use
   * h2 next. Those components in turn can increment headerLevel for their children.
   *
   * This way every page will have a perfect header tree and avoid complaints from WAVE.
   */
  headerLevel: number
  [keys: string]: any
}

interface BarOpts {
  editMode?: boolean
  label?: string
  extraClass?: string
}

export interface EditBarOpts extends BarOpts {
  inheritedFrom?: string
  disableDelete?: boolean
  disableDrop?: boolean
  hideEdit?: boolean
}

export interface RenderAreaEditBarOpts extends Omit<Omit<EditBarOpts, 'label'>, 'extraClass'> {
  /**
   * Since renderArea and renderComponents render a whole list of components,
   * they accept functions for editBarOpts.label and editBarOpts.extraClass
   *
   * This way you can have labels and classes depend on the data of the component.
   */
  label?: string | ((c: Component) => string)
  /**
   * Since renderArea and renderComponents render a whole list of components,
   * they accept functions for editBarOpts.label and editBarOpts.extraClass
   *
   * This way you can have labels and classes depend on the data of the component.
   */
  extraClass?: string | ((c: Component) => string)
}

export interface NewBarOpts extends BarOpts {
  disabled?: boolean
}

export interface RenderComponentsWrapParams {
  /**
   * Contains both the regular component content and the edit bar (or the new bar).
   *
   * Use this if you want to wrap content and edit bar together.
   */
  output: string
  /**
   * Contains only the regular component content and not the edit bar.
   *
   * If you use this, make sure to also use the bar parameter or else
   * you'll never print the edit bar and your components will be uneditable.
   */
  content: string
  /**
   * Contains the edit bar or new bar, depending on the situation.
   *
   * Use this if you want to wrap the bar separately from the component content.
   *
   * Will be blank in edit mode or when skipBars was set to true on the renderArea
   * and/or renderComponents call. You probably want to check if it's blank before
   * wrapping or you'll end up with an empty wrapper element.
   */
  bar: string
  /**
   * The index of the component currently being wrapped
   *
   * After pulling in any inherited components.
   */
  indexInArea: number
  /**
   * Contains the full component being wrapped.
   *
   * Use this if you need to check the component's data to alter your
   * wrapping behavior.
   *
   * Will be undefined for the new bar, so check that it is not null.
   */
  component?: Component
}

export interface RenderComponentsOpts {
  /**
   * Hide bars entiredly for inherited items instead of allowing the user
   * to link back to the creating page. Useful for headers and footers where it's
   * obvious the entire site shares the data from the root page.
   */
  hideInheritBars?: boolean
  /**
   * Do not print edit or new bars. Useful for components that have view-one-at-a-time
   * subcomponents. If you don't move your editbars somewhere else, you'll be unable to
   * re-order them easily.
   */
  skipBars?: boolean
  /**
   * Only skip edit bars, but print the new bar normally.
   *
   * If skipBars is also true, the new bar will not print normally, obviously.
   */
  skipEditBars?: boolean
  /**
   * Only skip the new bar, but print the edit bars normally.
   *
   * If skipBars is also true, the edit bars will not print normally, obviously.
   */
  skipNewBar?: boolean
  /**
   * Do not print the content, only print edit and new bars. This is the other half
   * of skipBars. You'd print bars in one place and content in another.
   *
   * If you only want to print the new bar, you need to set BOTH skipContent
   * and skipEditBars.
   */
  skipContent?: boolean
  /**
   * Provide a function that wraps each component, e.g.
   * ({ output }) => `<li>${output}</li>`
   *
   * Wrap receives a lot of optional paramaters so that you can customize the behavior. For
   * instance, you may want to wrap the content but not the edit bar, or vice versa. See
   * the comments on each parameter for more info.
   *
   * If you need it (unlikely), the full component object is provided as a second parameter.
   */
  wrap?: (info: RenderComponentsWrapParams) => string
  /**
   * Options for each edit bar; also accepts functions for label and extraClass
   */
  editBarOpts?: RenderAreaEditBarOpts
}

export interface RenderAreaOpts extends RenderComponentsOpts {
  /**
   * Set a minimum number of components for the area.
   *
   * Enforcement of the minimum components is UI-only. It's possible for a
   * page to be imported or updated via API with less than the minimum.
   */
  min?: number
  /**
   * Set a maximum number of components for the area.
   *
   * Enforcement of the maximum components is UI-only. It's possible for a
   * page to be imported or updated via API with more than the maximum.
   */
  max?: number
  /**
   * Remove new bar when max is reached
   *
   * If you've set a max, the new bar will change to disabled and change its
   * label when the max has been reached or exceeded. Set this true to completely
   * remove the new bar instead.
   */
  hideMaxWarning?: boolean
  /**
   * Set the maximum reached warning label
   *
   * If you've set a max, the new bar will change to disabled and change its
   * label when the max has been reached or exceeded. Set this to adjust the
   * wording of the maximum reached warning, when applicable.
   */
  maxWarning?: string
  /**
   * Options to pass into the new bar. Note that some like 'disabled' will
   * be overridden if you have set a max.
   */
  newBarOpts?: NewBarOpts
}

export interface RenderedComponent<C extends Component = Component> {
  component: C
  output: string
}

export abstract class Page<DataType extends PageData = any, FetchedType = any, RenderContextType extends ContextBase = any> extends Component<DataType, FetchedType, RenderContextType> {
  /**
   * The page id in case you need to pass it to the API, e.g. this.api.getRootPage(this.id)
   * in a page template or this.api.getRootPage(this.page.id) in a component template.
   */
  id: string

  /**
   * Other data we've already collected about the page being rendered, in case it's needed.
   */
  pageInfo: PageRecord<DataType>

  /**
   * This will be filled by the rendering server. The template properties are described
   * over in apitemplate.ts in the comment for APIPageTemplate.templateProperties.
   *
   * The properties will appear in the GraphQL API and the rendering server will automatically
   * download them and provide them here so all you need to do as a template developer is
   * reference the values in your fetch/setContext/render functions.
   */
  templateProperties!: any

  /**
   * This is a bunch of javascript and CSS and meta tags managed by the DosGato engine. It will
   * be filled by the rendering server and your render function for your page template
   * should place include it in the <head> element
   */
  headContent!: string

  /**
   * This method will be provided to page templates by the render server. You may call it
   * at any time during fetch, context, or render, to set an HTTP header on the response
   */
  addHeader!: (key: string, value: string | undefined) => void

  protected passError (e: Error, path: string) {
    console.warn(`Recoverable issue occured during render of ${this.pageInfo.path}. Component at ${path} threw the following error:`, e)
  }

  constructor (page: PageRecord<DataType>, editMode: boolean) {
    super(page.data, '', undefined, editMode)
    this.id = page.id
    this.pageInfo = page
  }
}
