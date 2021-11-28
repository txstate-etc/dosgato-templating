import { ResourceProvider } from './provider'
import { PageData, ComponentData } from './sharedtypes'

export interface PageRecord<DataType extends PageData = PageData> {
  id: string
  linkId: string
  path: string
  data: DataType
}

export interface PageWithAncestors<DataType extends PageData = PageData> extends PageRecord<DataType> {
  ancestors: PageRecord<PageData>[]
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

/**
 * This is the primary templating class to build your templates. Subclass it and provide
 * at least a render function.
 *
 * During rendering, it will be "hydrated" - placed into a full page structure with its
 * parent and child components linked.
 */
export abstract class Component<DataType extends ComponentData = any, FetchedType = any, RenderContextType extends ContextBase = any> extends ResourceProvider {
  // properties each template should provide
  static templateKey: string
  static templateName: string

  // properties for use during hydration, you do not have to provide these when
  // building a template, but you can use them in the functions you do provide
  areas = new Map<string, Component[]>()
  data: Omit<DataType, 'areas'>
  fetched!: FetchedType
  renderCtx!: RenderContextType
  path: string
  parent?: Component
  page?: Page
  hadError: boolean

  /**
   * The first phase of rendering a component is the fetch phase. Each component may
   * provide a fetch method that looks up data it needs from external sources. This step
   * is FLAT - it will be executed concurrently for all the components on the page for
   * maximum speed.
   *
   * Note that this.page will be available, along with its ancestors property containing
   * all the data from ancestor pages, in case there is a need for inheritance. It is
   * recommended to copy any needed data into the return object, as future phases will not
   * want to resolve the inheritance again.
   */
  async fetch (editMode: boolean) {
    return undefined as unknown as FetchedType
  }

  /**
   * The second phase of rendering a component is the context phase. This step is TOP-DOWN,
   * each component will receive the parent component's context, modify it as desired,
   * and then pass context to its children.
   *
   * This is useful for rendering logic that is sensitive to where the component exists in
   * the hierarchy of the page. For instance, if a parent component has used an h2 header
   * already, it will want to inform its children so that they can use h3 next, and they inform
   * their children that h4 is next, and so on. (Header level tracking is actually required in
   * dosgato CMS.)
   *
   * This function may return a promise in case you need to do something asynchronous based on
   * the context received from the parent, but use it sparingly since it will stall the process.
   * Try to do all asynchronous work in the fetch phase.
   */
  setContext (renderCtxFromParent: RenderContextType, editMode: boolean): RenderContextType|Promise<RenderContextType> {
    return renderCtxFromParent
  }

  /**
   * The final phase of rendering a component is the render phase. This step is BOTTOM-UP -
   * components at the bottom of the hierarchy will be rendered first, and the result of the
   * render will be passed to parent components so that the HTML can be included during the
   * render of the parent component.
   */
  abstract render (renderedAreas: Map<string, string[]>, editMode: boolean): string

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
  renderVariation (extension: string, renderedAreas: Map<string, string>) {
    return Array.from(renderedAreas.values()).join('')
  }

  // the constructor is part of the recursive hydration mechanism: constructing
  // a Component will also construct/hydrate all its child components
  constructor (data: DataType, path: string, parent: Component|undefined) {
    super()
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

  /**
   * For logging errors during rendering without crashing the render. If your fetch, setContext,
   * render, or renderVariation functions throw, the error will be logged but the page render will
   * continue. You generally do not need to use this function, just throw when appropriate.
   */
  logError (e: Error) {
    this.hadError = true
    this.parent?.passError(e, this.path)
  }

  // helper function for recursively passing the error up until it reaches the page
  protected passError (e: Error, path: string) {
    this.parent?.passError(e, path)
  }

  /**
   * During rendering, each component should register the CSS blocks that it needs. This may
   * change depending on the data. For instance, if you need some CSS to style up an image, but
   * only when the editor uploaded an image, you can check whether the image is present during
   * the execution of this function.
   *
   * This is evaluated after the fetch and context phases but before the rendering phase. If you
   * need any async data to make this determination, be sure to fetch it during the fetch phase.
   */
  cssBlocks (): string[] {
    return (this.constructor as any).cssBlocks().keys()
  }

  /**
   * Same as cssBlocks() but for javascript.
   */
  jsBlocks (): string[] {
    return (this.constructor as any).jsBlocks().keys()
  }
}

export abstract class Page<DataType extends PageData = any, FetchedType = any, RenderContextType extends ContextBase = any> extends Component<DataType, FetchedType, RenderContextType> {
  pagePath: string
  ancestors: PageRecord[]

  /**
   * we will fill this before rendering, stuff that dosgato knows needs to be added to
   * the <head> element
   * the page's render function must include it
   */
  headContent!: string

  protected passError (e: Error, path: string) {
    console.warn(`Recoverable issue occured during render of ${this.pagePath}. Component at ${path} threw the following error:`, e)
  }

  constructor (page: PageWithAncestors<DataType>) {
    super(page.data, '/', undefined)
    this.pagePath = page.path
    this.ancestors = page.ancestors
  }
}
