import { PageRecord, Page, ComponentData, Component } from './component'

/**
 * This registry will get filled with Component and Page objects upon server startup. Each
 * instance of dosgato CMS will have a repo where the server administrator can import all the
 * Component and Page objects that will be available in their instance and pass them to the
 * API Server, Rendering Server, and Admin UI Server. This is how server owners have control
 * over their installations and opt-in to whatever templates they want to have/support.
 */
class TemplateRegistry {
  public pages = new Map<string, new (page: PageRecord) => Page>()
  public components = new Map<string, new (component: ComponentData, path: string, parent: Component) => Component>()
  public all = [] as (typeof Component)[]

  /**
   * We will want to cache the migration process based on the page version and schema version
   * identifiers. So we want to stabilize the schema version rather than just saying "give me
   * the page at today's date". This function can help with that stabilization by finding the
   * last migration date in the current system so that API clients can detect and reuse it.
   *
   * It could also be done by hand and saved hard-coded in a client so that it has a predictable
   * view of the data, but an automated method will probably be more convenient.
   */
  public schemaversion!: Date

  addTemplate<T extends typeof Component> (template: T) {
    if (template instanceof Page) this.pages.set(template.templateKey, template as any)
    else this.components.set(template.templateKey, template as any)
    this.all.push(template)
    if (template.migrations.length) {
      const lastmigration = template.migrations[template.migrations.length - 1]
      if (!this.schemaversion || lastmigration.createdAt.getTime() > this.schemaversion.getTime()) {
        this.schemaversion = lastmigration.createdAt
      }
    }
  }

  getTemplate (templateKey: string) {
    return this.pages.get(templateKey) ?? this.components.get(templateKey)
  }
}

export const templateRegistry = new TemplateRegistry()
