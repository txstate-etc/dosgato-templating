import { PageRecord, ComponentData, PageData } from './component.js'
import { LinkDefinition } from './links.js'
import { stopwords } from './stopwords.js'

export type APITemplateType = 'page'|'component'|'data'

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
 * This interface lays out the structure the API needs for each template in the system.
 */
export interface APITemplate {
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
   * Each template must declare its areas and the template keys of components that will be
   * permitted inside each area. The list of allowed component templates can be updated beyond
   * the list provided here. See templateRegistry.addAvailableComponent's comment for info on why.
   */
  areas: Record<string, string[]>

  /**
   * Each template must provide a list of migrations for upgrading the data schema over time.
   * Typically this will start as an empty array and migrations will be added as the template
   * gets refactored.
   */
  migrations: Migration[]

  /**
   * Each template must provide a function that returns links from its data so that they
   * can be indexed. Only fields that are links need to be returned. Links inside rich editor
   * text will be extracted automatically from any text returned by getFulltext (see below)
   */
  getLinks: LinkGatheringFn

  /**
   * Each template must provide the text from any text or rich editor data it possesses, so that
   * the text can be decomposed into words and indexed for fulltext searches. Any text returned
   * by this function will also be scanned for links.
   */
  getFulltext: FulltextGatheringFn

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
   * names. The full page data, the path to this component, and a GraphQL query executor are
   * available as parameters in case you need them. Keep in mind that the current editor MUST
   * have access to any data you attempt to query in GraphQL.
   */
  validate?: (data: ComponentData, query: <T> (query: string, variables?: any) => Promise<T>, page: PageData, path: string) => Promise<ValidationFeedback[]>

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
export interface Migration {
  createdAt: Date
  up: (data: ComponentData, page: PageRecord) => ComponentData|Promise<ComponentData>
  down: (data: ComponentData, page: PageRecord) => ComponentData|Promise<ComponentData>
}

export type LinkGatheringFn = (data: any) => LinkDefinition[]
export type FulltextGatheringFn = (data: any) => string[]

/**
 * This function is used by API template definitions to help them identify links inside large blocks
 * of text and return them for indexing.
 */
export function extractLinksFromText (text: string) {
  const matches = text.matchAll(/{.*"type"\s?:\s+"\w+".*?}/gi)
  return Array.from(matches).map(m => JSON.parse(m[0])) as LinkDefinition[]
}

/**
 * This function is used by API template definitions to help them identify all the searchable
 * words in a large block of text and return them for indexing.
 */
export function getKeywords (text: string, options?: { stopwords?: boolean }) {
  return Array.from(new Set(text
    .toLocaleLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .split(/[^\w-]+/)
    .flatMap(word => word.includes('-') ? word.split('-').concat(word.replace('-', '')) : [word])
    .filter(word => word.length > 2 && (options?.stopwords === false || !stopwords[word]) && isNaN(Number(word)))
  ))
}
