import { IncomingHttpHeaders } from 'http'
import { templateRegistry } from './registry'
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

export abstract class Component<DataType extends ComponentData = any, FetchedType = any, RenderContextType extends ContextBase = any> {
  static templateKey: string
  static templateName: string
  /**
   * Each component template is responsible for declaring its areas and the types of component
   * that can fit into the area.
   */
  public areas = new Map<string, Component[]>()

  data: Omit<DataType, 'areas'>
  fetched!: FetchedType
  renderCtx!: RenderContextType
  path: string
  parent?: Component
  page?: Page
  hadError: boolean

  /**
   * The first phase of rendering a component is the fetch phase. Each component should
   * provide a fetch method that looks up data it needs from external sources. This step
   * is FLAT - it will be executed concurrently for all the components on the page for
   * maximum speed.
   *
   * Note that the page parameter will be pre-loaded with all the data from ancestor pages,
   * in case there is a need for inheritance. It is recommended to copy any needed data into
   * the return object, as future phases will not include the page data.
   */
  abstract fetch (page: PageWithAncestors<PageData>, editMode: boolean): Promise<FetchedType>

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
  abstract setContext (renderCtxFromParent: RenderContextType, editMode: boolean): RenderContextType|Promise<RenderContextType>

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
    this.parent = parent
    const { areas, ...ownData } = data
    for (const key of Object.keys(areas)) {
      const componentList = areas[key]
      const areaComponents: Component[] = []
      for (let i = 0; i < componentList.length; i++) {
        const componentData = componentList[i]
        const ComponentType = templateRegistry.components.get(componentData.templateKey)
        if (ComponentType) areaComponents.push(new ComponentType(componentData, `${path}/${key}/${i}`, this))
        else this.logError(new Error(`Template ${componentData.templateKey} is in the page data but no template code has been registered for it.`))
      }
      this.areas.set(key, areaComponents)
    }
    this.data = ownData
    this.path = path
    this.hadError = false
    let tmpParent = this.parent ?? this
    while (!(tmpParent instanceof Page) && tmpParent.parent) tmpParent = tmpParent.parent
    if (!(tmpParent instanceof Page)) throw new Error('Hydration failed, could not map component back to its page.')
    this.page = tmpParent
  }

  logError (e: Error) {
    this.hadError = true
    this.parent?.passError(e, this.path)
  }

  protected passError (e: Error, path: string) {
    this.parent?.passError(e, path)
  }

  /**
   * Each template should provide a map of CSS blocks where the map key is the unique name for
   * the CSS and the value is the CSS itself. For instance, if a template needs CSS from a
   * standard library like jquery-ui, it could include the full CSS for jquery-ui with 'jquery-ui'
   * as the key. Other templates that depend on jquery-ui would also provide the CSS, but
   * a page with both components would only include the CSS once, because they both called it
   * 'jquery-ui'.
   *
   * A version string (e.g. '1.2.5') may be provided for each block. The block with the highest
   * version number of any given name will be used. Other versions of that name will be ignored.
   */
  static cssBlocks () {
    return new Map<string, { css: string, version?: string }>()
  }

  /**
   * Same as cssBlocks() but for javascript.
   */
  static jsBlocks () {
    return new Map<string, { js: string, version?: string }>()
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
  }
}

// recursive helper function to traverse a hydrated page and return a flat array
// of Component instances
function collectComponents (component: Component) {
  const ret = [component] as Component<ComponentData>[]
  for (const areaList of component.areas.values()) {
    for (const component of areaList) {
      ret.push(...collectComponents(component))
    }
  }
  return ret
}

// recursive helper function for the context phase of rendering (phase 2)
function executeSetContext (editMode: boolean) {
  const setContextFn = async (component: Component) => {
    const components = Array.from(component.areas.values()).flat()
    await Promise.all(components.map(async c => {
      try {
        if (!c.hadError) c.renderCtx = await c.setContext(component.renderCtx, editMode)
      } catch (e: any) {
        c.logError(e)
      }
      await setContextFn(c)
    }))
  }
  return setContextFn
}

// recursive helper function for the final render phase of rendering (phase 3)
function renderComponent (editMode: boolean) {
  const renderFn = (component: Component) => {
    if (component.hadError) return ''
    const renderedAreas = new Map<string, string[]>()
    for (const [key, list] of component.areas) {
      const areaList = list.map(renderFn)
      renderedAreas.set(key, areaList)
    }
    try {
      return component.render(renderedAreas, editMode)
    } catch (e: any) {
      component.logError(e)
      return ''
    }
  }
  return renderFn
}

// recursive helper function for rendering a variation of a page
function renderVariation (extension: string) {
  const renderFn = (component: Component) => {
    if (component.hadError) return ''
    const renderedAreas = new Map<string, string>()
    for (const [key, list] of component.areas) {
      const areaList = list.map(renderFn)
      renderedAreas.set(key, areaList.join(''))
    }
    try {
      return component.renderVariation(extension, renderedAreas)
    } catch (e: any) {
      component.logError(e)
      return ''
    }
  }
  return renderFn
}

// helper function to convert a non-hydrated page into a hydrated page
// in other words, the input to this function is a raw JSON object, as stored in the
// database, and the output is a Page object, containing many Component objects, all
// of which are ready with the properties and methods defined above to support the rendering
// process
function hydratePage (page: PageRecord) {
  // find the page implementation in the registry
  const PageType = templateRegistry.pages.get(page.data.templateKey)
  if (!PageType) throw new Error('Unable to render page. Missing template implementation.')

  // hydrate the page data into full objects
  return new PageType(page)
}

/**
 * This function represents the entire rendering process. It takes a non-hydrated page (plus
 * the non-hydrated data for its ancestors, to support inheritance) and returns an HTML
 * string.
 *
 * Any migrations should be completed before rendering a page. They probably already happened
 * in the API Server.
 */
export async function renderPage (requestHeaders: IncomingHttpHeaders, page: PageWithAncestors, extension: string, editMode = false) {
  const pageComponent = hydratePage(page)
  const componentsIncludingPage = collectComponents(pageComponent)

  const cssComponents = Array.from(new Set(componentsIncludingPage.filter(c => (c.constructor as any).css).map(c => c.data.templateKey)))
  const jsComponents = Array.from(new Set(componentsIncludingPage.filter(c => (c.constructor as any).javascript).map(c => c.data.templateKey)))

  // execute the fetch phase
  await Promise.all(componentsIncludingPage.map(async c => {
    try {
      c.fetched = await c.fetch(page, editMode)
    } catch (e: any) {
      c.logError(e)
    }
  }))

  // if this is a variation, go ahead and render after the fetch phase
  if (extension && extension !== 'html') return renderVariation(extension)(pageComponent)

  // execute the context phase
  pageComponent.renderCtx = await pageComponent.setContext({ headerLevel: 1, requestHeaders }, editMode)
  await executeSetContext(editMode)(pageComponent)

  // provide content for the <head> element and give it to the page component
  pageComponent.headContent = (editMode ? editModeIncludes() : '') + [
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.jsBlocks()))).map(name => `<script src="/.resources/${templateRegistry.resourceversion}/${name}.js"></script>`),
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.cssBlocks()))).map(name => `<link rel="stylesheet" href="/.resources/${templateRegistry.resourceversion}/${name}.css">`)
  ].join('\n')

  // execute the render phase
  return renderComponent(editMode)(pageComponent)
}

function editModeIncludes () {
  return '' // TODO: include script and css to support implementation of edit bars
}
