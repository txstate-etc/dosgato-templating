interface AreaDefinition {
  name: string
  availableComponents: string[]
}

interface ComponentData {
  template: string
  areas: Record<string, ComponentData[]>
}

interface PageData<DataType extends ComponentData = ComponentData> {
  id: string
  linkId: string
  path: string
  data: DataType
}

interface PageWithAncestors<DataType extends ComponentData = ComponentData> extends PageData<DataType> {
  ancestors: PageData<ComponentData>[]
}

interface ContextBase {
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
  static areas = new Map<string, AreaDefinition>()
  public areas = new Map<string, Component[]>()

  data: Omit<DataType, 'areas'>
  fetched!: FetchedType
  renderCtx!: RenderContextType
  path: string
  parent?: Component
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
  abstract fetch (page: PageWithAncestors<ComponentData>): Promise<FetchedType>

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
  abstract setContext (renderCtxFromParent: RenderContextType): RenderContextType|Promise<RenderContextType>

  /**
   * The final phase of rendering a component is the render phase. This step is BOTTOM-UP -
   * components at the bottom of the hierarchy will be rendered first, and the result of the
   * render will be passed to parent components so that the HTML can be included during the
   * render of the parent component.
   */
  abstract render (renderedAreas: Map<string, string[]>): string

  constructor (data: DataType, path: string, parent: Component|undefined) {
    this.parent = parent
    const { areas, ...ownData } = data
    for (const key of Object.keys(areas)) {
      const componentList = areas[key]
      const areaComponents: Component[] = []
      for (let i = 0; i < componentList.length; i++) {
        const componentData = componentList[i]
        const ComponentType = componentRegistry.get(componentData.template)
        if (ComponentType) areaComponents.push(new ComponentType(componentData, `${path}/${key}/${i}`, this))
      }
      this.areas.set(key, areaComponents)
    }
    this.data = ownData
    this.path = path
    this.hadError = false
  }

  /**
   * Use this function to extend a component after importing it. For instance,
   * if another developer writes a component for a carded layout, and you write a new
   * card that fits in that layout, you can add your custom card to its availableComponents
   * while constructing your individual CMS server.
   */
  static addAvailableComponent (area: string, templateKey: string) {
    this.areas.get(area)?.availableComponents.push(templateKey)
  }

  logError (e: Error) {
    this.hadError = true
    this.parent?.passError(e, this.path)
  }

  protected passError (e: Error, path: string) {
    this.parent?.passError(e, path)
  }
}

export abstract class Page<DataType extends ComponentData = any, FetchedType = any, RenderContextType extends ContextBase = any> extends Component<DataType, FetchedType, RenderContextType> {
  pagePath: string

  protected passError (e: Error, path: string) {
    console.warn(`Recoverable issue occured during render of ${this.pagePath}. Component at ${path} threw the following error:`, e)
  }

  constructor (page: PageWithAncestors<DataType>) {
    super(page.data, '/', undefined)
    this.pagePath = page.path
  }
}

const componentRegistry = new Map<string, new (component: ComponentData, path: string, parent: Component) => Component>()
const pageRegistry = new Map<string, new (page: PageWithAncestors) => Page>()

function collectComponents (component: Component): Component[] {
  const ret = [component]
  for (const areaList of component.areas.values()) {
    for (const component of areaList) {
      ret.push(...collectComponents(component))
    }
  }
  return ret
}

async function executeSetContext (component: Component) {
  const components = Array.from(component.areas.values()).flat()
  await Promise.all(components.map(async c => {
    try {
      if (!c.hadError) c.renderCtx = await c.setContext(component.renderCtx)
    } catch (e: any) {
      c.logError(e)
    }
    await executeSetContext(c)
  }))
}

function renderComponent (component: Component): string {
  if (component.hadError) return ''
  const renderedAreas = new Map<string, string[]>()
  for (const [key, list] of component.areas) {
    const areaList = list.map(renderComponent)
    renderedAreas.set(key, areaList)
  }
  try {
    return component.render(renderedAreas)
  } catch (e: any) {
    component.logError(e)
    return ''
  }
}

export async function renderPage (page: PageWithAncestors) {
  // find the page implementation in the registry
  const PageType = pageRegistry.get(page.data.template)
  if (!PageType) throw new Error('Unable to render page. Missing template implementation.')

  // hydrate the page data into full objects
  const pageComponent = new PageType(page)

  // TODO: perform migrations

  // execute the fetch phase
  const components = collectComponents(pageComponent)
  await Promise.all(components.map(async c => {
    try {
      c.fetched = await c.fetch(page)
    } catch (e: any) {
      c.logError(e)
    }
  }))

  // execute the context phase
  pageComponent.renderCtx = await pageComponent.setContext({ headerLevel: 1 })
  await executeSetContext(pageComponent)

  // execute the render phase
  return renderComponent(pageComponent)
}
