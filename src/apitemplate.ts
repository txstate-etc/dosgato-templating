import type { ComponentData, DataData, PageData } from './component.js'
import { type LinkDefinition } from './links.js'
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
export interface PageExtras <DataType = PageData> {
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
  /** The linkId the page has. Null during page creation. */
  linkId?: string
  /** The name the page has or will have. NOTE: looking the page up by name will not work during page creation. */
  name: string
  /**
   * The full page data before the validation in case validating depends on the previous
   * state of the page.
   *
   * Will be undefined for page creation or during migration.
   */
  page?: DataType
}
export interface ComponentExtras <DataType = ComponentData> extends PageExtras {
  /** The path within the page data to the component currently being evaluated. */
  path: string
  /**
   * The full page data before the validation/migration in case validating depends on state
   * elsewhere in the page.
   */
  page: PageData
  /**
   * The component data before validation. Undefined for a new component or during migration.
   */
  currentData?: DataType
}
export interface DataExtras<DataType = DataData> {
  /** A function for executing a graphql query to acquire more information than is already at hand. */
  query: GraphQLQueryFn
  /** The id of the dataroot the entry lives in or will be placed in. */
  dataRootId: string
  /** The id of the data folder the entry lives in or will be placed in. Null if directly in the dataroot. */
  dataFolderId?: string
  /** The id of the data entry itself. NOTE: will be null during page creation. */
  dataId?: string
  /**
   * The data before validation. Undefined for a new data entry or during migration.
   */
  currentData?: DataType
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
   * can be indexed. Only fields that are links need to be returned as links inside rich editor
   * text will be extracted automatically from any text returned by getFulltext (see below).
   * Examples of links to include would be links refereced by `href` and `src` attributes in
   * anchor, image, and video elements.
   * @note You do not need to filter the links returned to ensure they're defined as that can
   * be done by the routine that calls `getLinks`.
   * @note If you are certain of the `LinkDefinition` translations allowed for the string of
   * the link you would return in this array it would be a good idea to go ahead and coerce
   * the string to the full type associated with it.
   */
  getLinks?: LinkGatheringFn<DataType>

  /**
   * Each template must provide the text from any text or rich editor data it possesses, so that
   * the text can be decomposed into words and indexed for fulltext searches. Any text returned
   * by this function will also be scanned for links.
   * Examples of text to include would be any text from data that's rendered as visible text content
   * but not things like dates and times.
   * @note You do not need to filter the text elements returned to ensure they're defined as that
   * can be done by the routine that calls `getFulltext`.
   */
  getFulltext?: FulltextGatheringFn<DataType>

  /**
   * Extra filters for this template
   *
   * Use this function to return arbitrary tags for your template. These tags will be indexed
   * and may be used later as a search filter.
   *
   * For example, pages may set a 'shownInNav' tag and this could be passed to the getNavigation
   * function during rendering to return a smaller set of pages for navigation.
   */
  getTags?: FulltextGatheringFn<DataType>

  /**
   * Copying components around is a core feature in DosGato, but sometimes the data stored
   * is not suitable for copying, for example unique identifiers generated by FieldIdentifier
   * should be regenerated during a copy.
   *
   * Provide this function to do work like that. It will only be called when content is being
   * copied, i.e. the original still exists.
   *
   * The pageCopy parameter will be true when an entire page is being copied, and false when a
   * component or data entry is being copied. Sometimes you will want to behave differently in
   * those cases. For instance, if you generate a unique id and then make references to it on
   * the same page, you would not want to regenerate those ids during a full page copy because
   * all the references would break, but you would want to regenerate id on an in-page copy
   * because you need new ids for the new objects.
   *
   * workspace is an initially empty object that onCopy methods from various components can use
   * as shared memory. You would need this to do something like regenerating ids and also
   * updating references. You would keep a map of original id -> new id in workspace.mynamespace
   * and set it any time you encounter an id or reference.
   */
  onCopy?: (data: DataType, pageCopy: boolean, workspace: Record<string, any>) => void

  /**
   * The available component list in the main content area can get very long, among others. Therefore, each
   * template may set a displayCategory and any templates that share a displayCategory will be grouped together
   * underneath one tab when a user is presented with a choice of template.
   *
   * If a displayCategory is not set, there will be a default category like 'Standard'. If only one category
   * exists for a group of available components, the tabs will not be shown at all. This means you do not have
   * to bother setting displayCategory for minor cases like different kinds of slides in a slider (until there
   * are so many that it becomes a good idea!).
   */
  displayCategory?: string
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
  validate?: (data: DataType, extras: ComponentExtras<DataType>) => Promise<ValidationFeedback[]>

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
  validate?: (data: DataType, extras: PageExtras<DataType>) => Promise<ValidationFeedback[]>

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

  /**
   * Container components specify their own list of compatible templates for each of their areas,
   * but it is possible that a sub-component could be compatible with its container while not really
   * being compatible with the template as a whole. For instance, a special purpose template may want
   * to allow containers but only a couple simple components inside those containers.
   *
   * Without this property, the only choice would be to re-make all your container components with a special
   * templateKey just for this page template and their custom set of availableComponents. That's a lot to maintain,
   * so this property is available to disallow sub-components at the page template level.
   *
   * Any template key you list here will be unavailable inside this page template, no matter how many
   * nested containers are in between.
   */
  disallowComponents?: string[]
}

export interface APIDataTemplate<DataType extends DataData = any> extends APITemplate<DataType> {
  type: 'data'
  /**
   * Data template implementations receive the id of the dataroot the data is/will be inside,
   * as well as the folder id (if applicable) and their own id. Keep in mind dataId will be
   * null when it is a creation operation.
   *
   * nameIsTaken will be true when the automatically generated name for the data entry already
   * exists elsewhere in the folder. This fact can be ignored and the generated name will be automatically
   * numerated to be unique. If you would rather present the editor with a validation error and let them resolve
   * the conflict, this parameter gives you an opportunity to do that.
   *
   * Note that numeration can lead to the name changing during unrelated edits, possibly breaking
   * links. For example, on creation the name is set with a "-1" suffix because of a conflict, then
   * the conflicting entry is deleted. Editing this data entry again will remove the "-1" because
   * of the lack of conflict.
   */
  validate?: (data: DataType, extras: DataExtras<DataType>, nameIsTaken: boolean) => Promise<ValidationFeedback[]>

  migrations?: DataMigration<DataType>[]

  /**
   * Mark this data type as inappropriate for sites. For example, if you have system-wide configuration
   * stored in data, it may be confusing to see the site list when editing that data. Set this
   * true to avoid showing the site list and stop allowing data of this type to be attached to sites.
   */
  global?: boolean

  /**
   * Mark this data type as inappropriate for global. For example, if you have a data type for site
   * configurations, a global entry might make no sense. Setting this will avoid showing editors
   * the global space in the dataroot list.
   */
  noglobal?: boolean

  /**
   * Data objects must have names so that they can be linked to at a specific path. However,
   * for an editor, setting an addressable name for a data entry that already has, say, a
   * title, is both tedious and confusing.
   *
   * Instead, it is the data template developer's responsibility to create the name from
   * the data gathered from the editor. If there is a title, that's a great option. Otherwise,
   * the dialog may need to have an explicit `name` field. Either way it's up to the developer
   * of each data template to decide and provide.
   *
   * Whatever is returned from this function will be further processed to fit well in a path -
   * i.e. lower-cased and non-word characters replaced by a dash. If there is a duplicate data
   * entry in the same folder, it will be automatically numerated.
   *
   * If you return undefined or an empty string, the name `item-1` will be used, which will
   * then be numerated as necessary.
   */
  computeName: (data: DataType) => string | undefined

  /**
   * For some types of data, the concept of publishing will be confusing for users. In these
   * cases, you can set this to true and all entries will be automatically published to latest
   * on every change.
   */
  nopublish?: boolean
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

export type LinkGatheringFn<DataType> = (data: DataType) => (LinkDefinition | string | undefined)[]
export type FulltextGatheringFn<DataType> = (data: DataType) => (string | undefined)[]
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
