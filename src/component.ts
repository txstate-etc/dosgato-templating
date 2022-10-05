import type { IncomingHttpHeaders } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import { isNotBlank } from 'txstate-utils'
import { ResourceProvider } from './provider.js'
import { APIClient } from './render.js'

/**
 * This is the primary templating class to build your templates. Subclass it and provide
 * at least a render function.
 *
 * During rendering, it will be "hydrated" - placed into a full page structure with its
 * parent and child components linked.
 */
export abstract class Component<DataType extends ComponentData = any, FetchedType = any, RenderContextType extends ContextBase = any> extends ResourceProvider {
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
  registerInherited!: (area: string, components: ComponentData[], fromPageId: string, top?: true) => void

  /**
   * The second phase of rendering a component is the context phase. This step is TOP-DOWN and
   * NON-MUTATING. Each component will receive the parent component's context and then pass a
   * NEW context object to its children.
   *
   * This is useful for rendering logic that is sensitive to where the component exists in
   * the hierarchy of the page. For instance, if a parent component has used an h2 header
   * already, it will want to inform its children so that they can use h3 next, and they inform
   * their children that h4 is next, and so on. (Header level tracking is supported by default in
   * dosgato CMS.)
   *
   * This function may return a promise in case you need to do something asynchronous based on
   * the context received from the parent, but use it sparingly since it will stall the process.
   * Try to do all asynchronous work in the fetch phase.
   */
  setContext (renderCtxFromParent: RenderContextType): RenderContextType | Promise<RenderContextType> {
    return renderCtxFromParent
  }

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
   * need to do something advanced like wrap each component in a div
   */
  renderComponents (components: RenderedComponent[] | string = [], opts?: { hideInheritBars?: boolean, editBarOpts?: RenderAreaEditBarOpts }) {
    if (!Array.isArray(components)) components = this.renderedAreas.get(components) ?? []
    return components
      .flatMap(c =>
        c.component.inheritedFrom &&
        opts?.hideInheritBars
          ? [c.output]
          : [c.component.editBar({
              ...opts?.editBarOpts,
              label: typeof opts?.editBarOpts?.label === 'function' ? opts.editBarOpts.label(c.component) : opts?.editBarOpts?.label,
              extraClass: typeof opts?.editBarOpts?.extraClass === 'function' ? opts.editBarOpts.extraClass(c.component) : opts?.editBarOpts?.extraClass
            }), c.output]).join('')
  }

  /**
   * helper function to print an area and set a minimum or maximum number of components
   */
  renderArea (areaName: string, opts?: { min?: number, max?: number, hideMaxWarning?: boolean, maxWarning?: string, hideInheritBars?: boolean, newBarOpts?: NewBarOpts, editBarOpts?: RenderAreaEditBarOpts }) {
    const components = this.renderedAreas.get(areaName) ?? []
    const ownedComponentCount = components.filter(c => !c.component.inheritedFrom).length
    const full = !!(opts?.max && ownedComponentCount >= opts.max)
    let output = this.renderComponents(components, { hideInheritBars: opts?.hideInheritBars, editBarOpts: { ...opts?.editBarOpts, disableDelete: ownedComponentCount <= (opts?.min ?? 0), disableDrop: full } })
    if (full) {
      if (!opts.hideMaxWarning) output += this.newBar(areaName, { ...opts.newBarOpts, label: opts.maxWarning ?? 'Maximum Reached', disabled: true })
    } else {
      output += this.newBar(areaName, opts?.newBarOpts)
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
    options.extraClass ??= this.editClass()
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
    options.extraClass ??= this.newClass(areaName)
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
  publishedAt: Date | null
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
}

export interface PageData extends ComponentData {
  savedAtVersion: string
}

export interface DataData {
  templateKey: string
  savedAtVersion: string
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
  label?: string | ((c: Component) => string)
  extraClass?: string | ((c: Component) => string)
}

export interface NewBarOpts extends BarOpts {
  disabled?: boolean
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
