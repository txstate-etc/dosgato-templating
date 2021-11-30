import { PageWithAncestors, ComponentData } from './component'
import { LinkDefinition } from './links'

export type TemplateType = 'page'|'component'|'data'

/**
 * This interface lays out the structure the API needs for each template in the system.
 */
export interface Template {
  type: TemplateType

  /**
   * A unique string to globally identify this template across installations. Namespacing like
   * edu.txstate.RichTextEditor could be useful but no special format is required.
   */
  templateKey: string

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
   * shaped properly. If there are no issues, it should return an empty object {}, otherwise it
   * should return an object with keys that reference the path to the error and values that
   * are an array of error messages pertaining to that path.
   *
   * For instance, if name is required and the user didn't provide one, you would return:
   * { name: ['A name is required.'] }
   *
   * This method is async so that you can do things like look in the database for conflicting
   * names.
   */
  validate: (data: any) => Promise<Record<string, string[]>>
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
  up: (data: ComponentData, page: PageWithAncestors) => ComponentData|Promise<ComponentData>
  down: (data: ComponentData, page: PageWithAncestors) => ComponentData|Promise<ComponentData>
}

export type LinkGatheringFn = (data: any) => LinkDefinition[]
export type FulltextGatheringFn = (data: any) => string[]