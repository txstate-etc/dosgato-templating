import { ComponentData, DataData, PageData } from './component.js'
import { LinkDefinition } from './links.js'
import { stopwords } from './stopwords.js'

export type APITemplateType = 'page' | 'component' | 'data'

export enum ValidationMessageType {
  ERROR = 'error',
  WARNING = 'warning',
  SUCCESS = 'success'
}

export interface ValidationFeedback {
  type?: `${ValidationMessageType}`
  path?: string
  message: string
}

/**
 * This is information that the API will pass to the validation and migration
 * functions provided by template implementations. It will help template developers
 * do advanced logic when validating or migrating data, e.g. looking up a name in the
 * API to make sure it hasn't been used already.
 */
export interface PageExtras {
  /** A function for executing a graphql query to acquire more information than is already at hand. */
  query: GraphQLQueryFn
  /** The site id in which the page lives or is being created. Null if we are validating creation of a site. */
  siteId?: string
  /** The pagetree id in which the page lives or is being created. Null if we are validating creation of a site or pagetree. */
  pagetreeId?: string
  /** The page id of the page's parent or parent-to-be. Null if it is the root page of a pagetree. */
  parentId?: string
  /** The page's id, presumably to be used in graphql queries. NOTE: will be null during page creation. */
  pageId?: string
  /** The path in the pagetree to the page, or what the path will be. NOTE: looking the page up by path will not work during page creation. */
  pagePath?: string
  /** The linkId the page has or will have. NOTE: looking the page up by linkId will not work during page creation. */
  linkId: string
  /** The name the page has or will have. NOTE: looking the page up by name will not work during page creation. */
  name: string
}
export interface ComponentExtras extends PageExtras {
  /**
   * The full page data in case validating or migrating a component depends on state
   * elsewhere in the page.
   */
  page: PageData
  /** The path within the page data to the component currently being evaluated. */
  path: string
}
export interface DataExtras {
  /** A function for executing a graphql query to acquire more information than is already at hand. */
  query: GraphQLQueryFn
  /** The id of the dataroot the entry lives in or will be placed in. */
  dataRootId: string
  /** The id of the data folder the entry lives in or will be placed in. Null if directly in the dataroot. */
  dataFolderId?: string
  /** The id of the data entry itself. NOTE: will be null during page creation. */
  dataId?: string
}

/**
 * This interface lays out the structure the API needs for each template in the system.
 */
export interface APITemplate<DataType> {
  type: APITemplateType

  /**
   * A unique string to globally identify this template across installations. Namespacing like
   * edu.txstate.RichTextEditor could be useful but no special format is required.
   */
  templateKey: string

  /**
   * A uniquey human-readable name describing this template
   */
  name: string

  /**
   * Each template must provide a function that returns links from its data so that they
   * can be indexed. Only fields that are links need to be returned. Links inside rich editor
   * text will be extracted automatically from any text returned by getFulltext (see below)
   */
  getLinks?: LinkGatheringFn<DataType>

  /**
   * Each template must provide the text from any text or rich editor data it possesses, so that
   * the text can be decomposed into words and indexed for fulltext searches. Any text returned
   * by this function will also be scanned for links.
   */
  getFulltext?: FulltextGatheringFn<DataType>
}

export interface APIComponentTemplate<DataType extends ComponentData = any> extends APITemplate<DataType> {
  type: 'component'

  /**
   * Each template must declare its areas and the template keys of components that will be
   * permitted inside each area. The list of allowed component templates can be updated beyond
   * the list provided here. See templateRegistry.addAvailableComponent's comment for info on why.
   */
  areas?: Record<string, string[]>

  /**
   * Each template must provide a validation function so that the API can enforce its data is
   * shaped properly.
   *
   * Each entry in the return array can have a type of error, warning, or success. Errors
   * represent a validation failure and mean that saving will not succeed. Warnings are shown
   * to the editor but do not prevent saving. Success messages postively affirm valid input - for
   * instance, a name they chose is available.
   *
   * As an example, if name is required and the user didn't provide one, you would return:
   * [{ type: 'error', path: 'name', message: 'A name is required.' }]
   *
   * This method is async so that you can do things like look in the database for conflicting
   * names. Keep in mind that the current editor MUST have access to any data you attempt to
   * query in GraphQL.
   *
   * See the ComponentExtras type to see all the contextual information you'll have available.
   */
  validate?: (data: DataType, extras: ComponentExtras) => Promise<ValidationFeedback[]>

  /**
   * Each template must provide a list of migrations for upgrading the data schema over time.
   * Typically this will start as an empty array and migrations will be added as the template
   * gets refactored.
   */
  migrations?: ComponentMigration<DataType>[]
}

export interface APIPageTemplate<DataType extends PageData = any> extends APITemplate<DataType> {
  type: 'page'

  /**
   * Page areas are the same as components but are required.
   */
  areas?: Record<string, string[]>

  /**
   * Page template implementations do not receive a path like component templates do.
   */
  validate?: (data: DataType, extras: PageExtras) => Promise<ValidationFeedback[]>

  migrations?: PageMigration<DataType>[]

  /**
   * Hard-coded properties that may be set on page templates to influence the rendering of
   * components on the page. For instance, a set of color choices that are customized for
   * each template design. Components on the page may refer to the color information stored
   * in the template during dialogs and while rendering. Changing to a different page template
   * could then result in different color choices for components like buttons.
   *
   * Must be null for non-page templates.
   */
  templateProperties?: any
}

export interface APIDataTemplate<DataType extends DataData = any> extends APITemplate<DataType> {
  type: 'data'
  /**
   * Data template implementations receive the id of the dataroot the data is/will be inside,
   * as well as the folder id (if applicable) and their own id. Keep in mind dataId will be
   * null when it is a creation operation.
   */
  validate?: (data: DataType, extras: DataExtras) => Promise<ValidationFeedback[]>

  migrations?: DataMigration<DataType>[]
}

export type APIAnyTemplate = APIComponentTemplate | APIPageTemplate | APIDataTemplate

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
 *
 * All migration functions receive a `query` function for making a graphql query, in case the
 * migration depends on the state of a parent page or something. Be careful not
 * to create an infinite loop - querying a page will trigger that page to be migrated, which
 * could end up calling your code again on that page.
 *
 * If you're migrating a component template, you'll also get the page record and the
 * path inside that page's data to the component being migrated.
 */
export interface Migration <DataType, ExtraType> {
  createdAt: Date
  up: (data: DataType, extras: ExtraType) => DataType | Promise<DataType>
  down: (data: DataType, extras: ExtraType) => DataType | Promise<DataType>
}
export type ComponentMigration<DataType extends ComponentData = ComponentData> = Migration<DataType, ComponentExtras>
export type PageMigration<DataType extends PageData = PageData> = Migration<DataType, PageExtras>
export type DataMigration<DataType extends DataData = DataData> = Migration<DataType, DataExtras>
export type AnyMigration = ComponentMigration | PageMigration | DataMigration

export type LinkGatheringFn<DataType> = (data: DataType) => LinkDefinition[]
export type FulltextGatheringFn<DataType> = (data: DataType) => string[]
export type GraphQLQueryFn = <T> (query: string, variables?: any) => Promise<T>

/**
 * This function is used by API template definitions to help them identify all the searchable
 * words in a large block of text and return them for indexing.
 */
export function getKeywords (text?: string, options?: { stopwords?: boolean }) {
  if (!text) return []
  return Array.from(new Set(text
    .toLocaleLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .split(/[^\w-]+/)
    .flatMap(word => word.includes('-') ? word.split('-').concat(word.replace('-', '')) : [word])
    .filter(word => word.length > 2 && (options?.stopwords === false || !stopwords[word]) && isNaN(Number(word)))
  ))
}
