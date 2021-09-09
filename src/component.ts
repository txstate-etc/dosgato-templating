import { sortby } from 'txstate-utils'
import rfdc from 'rfdc'
const clone = rfdc()

interface AreaDefinition {
  name: string
  availableComponents: string[]
}

interface ComponentData {
  templateKey: string
  areas: Record<string, ComponentData[]>
}

interface PageData extends ComponentData {
  savedAtVersion: Date
}

interface PageRecord<DataType extends PageData = PageData> {
  id: string
  linkId: string
  path: string
  data: DataType
}

interface PageWithAncestors<DataType extends PageData = PageData> extends PageRecord<DataType> {
  ancestors: PageRecord<PageData>[]
}

/**
 * In dosgato CMS, the data in the database is not altered except during user activity. This
 * means that older records could have been saved when the schema expected by component
 * rendering code was different than the date it's being rendered. To handle this, each
 * page and component template is required to provide migrations responsible for
 * transforming the data to the needed schema version.
 *
 * In order to support backwards compatibility, each API client will specify the date
 * when the code was written, so that their assumptions about the schema will be
 * frozen in time. This system means that migrations need to run backward as well as forward
 * in time.
 *
 * The `up` method is for changing data from an older schema to a newer one. The
 * `down` method is for changing data back from the newer schema to the older one.
 * If a `down` method cannot be provided, the migration is considered to be a breaking
 * change and anyone asking to rewind time to before the migration will receive an error.
 *
 * Your `up` and `down` methods will be applied to components in bottom-up fashion, so you
 * can assume that any components inside one of your areas has already been processed.
 */
interface Migration {
  createdAt: Date
  up: (data: ComponentData) => ComponentData|Promise<ComponentData>
  down: (data: ComponentData) => ComponentData|Promise<ComponentData>
}

interface MigrationWithTemplate extends Migration {
  templateKey: string
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

interface ResourceIdentifier {
  type: 'js'|'css'
  url: string
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
   * Return any css resources that might belong in the head. You can host these however you
   * wish. Duplicates will be eliminated.
   */
  cssUrls () {
    return [] as string[]
  }

  /**
   * Return any js resources that might belong in the head. You can host these however you
   * wish. Duplicates will be eliminated.
   */
  jsUrls () {
    return [] as string[]
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
        const ComponentType = componentRegistry.get(componentData.templateKey)
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

  static migrations: Migration[] = []
  static javascript: string = ''
  static css: string = ''

  /**
   * Use this function to extend a component after importing it. For instance,
   * if another developer writes a component for a carded layout, and you write a new
   * card that fits in that layout, you can add your custom card to its availableComponents
   * while constructing your individual CMS server.
   */
  static addAvailableComponent (area: string, templateKey: string) {
    this.areas.get(area)?.availableComponents.push(templateKey)
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

/**
 * These registries will get filled with Component and Page objects upon server startup. Each
 * instance of dosgato CMS will have a repo where the server administrator can import all the
 * Component and Page objects that will be available in their instance and pass them to the
 * API Server, Rendering Server, and Admin UI Server. This is how server owners have control
 * over their installations and opt-in to whatever templates they want to have/support.
 */
export const componentRegistry = new Map<string, new (component: ComponentData, path: string, parent: Component) => Component>()
export const pageRegistry = new Map<string, new (page: PageRecord) => Page>()

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

// recursive helper function to traverse a non-hydrated page and return a flat
// array of templateKey strings in use on the page
function collectTemplates (component: ComponentData) {
  const ret = [component.templateKey]
  for (const areaList of Object.values(component.areas)) {
    for (const component of areaList) {
      ret.push(...collectTemplates(component))
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

// helper function to convert a non-hydrated page into a hydrated page
// in other words, the input to this function is a raw JSON object, as stored in the
// database, and the output is a Page object, containing many Component objects, all
// of which are ready with the properties and methods defined above to support the rendering
// process
function hydratePage (page: PageRecord) {
  // find the page implementation in the registry
  const PageType = pageRegistry.get(page.data.templateKey)
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
export async function renderPage (page: PageWithAncestors, editMode = false) {
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

  // execute the context phase
  pageComponent.renderCtx = await pageComponent.setContext({ headerLevel: 1 }, editMode)
  await executeSetContext(editMode)(pageComponent)

  // provide content for the <head> element and give it to the page component
  pageComponent.headContent = (editMode ? editModeIncludes() : '') + [
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.jsUrls()))).map(url => `<script src="${url}"></script>`),
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.cssUrls()))).map(url => `<link rel="stylesheet" href="${url}">`),
    ...jsComponents.map(templateKey => `<script src="/.resources/${templateKey}.js"></script>`),
    ...cssComponents.map(templateKey => `<link rel="stylesheet" href="/.resources/${templateKey}.css">`)
  ].join('\n')

  // execute the render phase
  return renderComponent(editMode)(pageComponent)
}

// recursive helper function to traverse a page and apply one migration to any applicable
// components
async function processMigration (component: ComponentData, migration: MigrationWithTemplate, backward: boolean) {
  const migrate = backward ? migration.down : migration.up
  const newAreas: Record<string, Promise<ComponentData>[]> = {}

  for (const [areaKey, areaList] of Object.entries(component.areas)) {
    for (const cData of areaList) {
      newAreas[areaKey].push(processMigration(cData, migration, backward))
    }
  }
  for (const areaKey of Object.keys(component.areas)) {
    component.areas[areaKey] = await Promise.all(newAreas[areaKey])
  }
  if (migration.templateKey === component.templateKey) component = await migrate(component)
  return component
}

/**
 * This function represents the entire process of migrating a page from one schema version
 * to another.
 *
 * Schema versions are represented as Dates so that components built by different authors
 * can be mixed and matched and have their migrations placed on a single timeline. It
 * could still get complicated if a third party component is not upgraded for some time and
 * the page component has done something to alter it in the mean time. That shouldn't pop up
 * often as usually the page's interest is in re-organizing components rather than
 * manipulating their internals.
 */
export async function migratePage (page: PageData, toSchemaVersion: Date = new Date()) {
  let migrated = clone(page)
  const templateKeysInUse = new Set(collectTemplates(page))
  const fromSchemaVersion = page.savedAtVersion
  const backward = fromSchemaVersion > toSchemaVersion
  // collect all the migrations from every component in the registry and filter out
  // the ones this page does not use or that are outside the time range in which we are
  // performing our transformation
  const migrations = ([...pageRegistry.values(), ...componentRegistry.values()] as unknown as (typeof Component)[])
    .filter(p => templateKeysInUse.has(p.templateKey))
    .flatMap(p => p.migrations.map(m => ({ ...m, templateKey: p.templateKey })))
    .filter(m => backward
      ? m.createdAt < fromSchemaVersion && m.createdAt > toSchemaVersion
      : m.createdAt > fromSchemaVersion && m.createdAt < toSchemaVersion
    )
  // now that we have a big list of migrations, we need to sort them by date to
  // make sure they go in order (e.g. if component A has a migration between the two
  // migrations specified by component B, we need to sort so we can run them in proper
  // order)
  const sortedMigrations = sortby(migrations, 'createdAt', backward)

  for (const migration of sortedMigrations) migrated = await processMigration(migrated, migration, backward) as PageData
  migrated.savedAtVersion = toSchemaVersion
  return migrated
}

function editModeIncludes () {
  return '' // TODO: include script and css to support implementation of edit bars
}

/**
 * We will want to cache the migration process based on the page version and schema version
 * identifiers. So we want to stabilize the schema version rather than just saying "give me
 * the page at today's date". This function can help with that stabilization by finding the
 * last migration date in the current system so that API clients can detect and reuse it.
 *
 * It could also be done by hand and saved hard-coded in a client so that it has a predictable
 * view of the data, but an automated method will probably be more convenient.
 */
export function getCurrentSchemaVersion () {
  return new Date(Math.max(...([...pageRegistry.values(), ...componentRegistry.values()] as unknown as (typeof Component)[])
    .flatMap(p => p.migrations.map(m => m.createdAt.getTime()))
  ))
}
