import { minify } from 'csso'
import { readFileSync } from 'fs'
import semver from 'semver'
import { minify as jsminify } from 'terser'
import { PageRecord, Page, Component } from './component'
import { ComponentData } from './sharedtypes'

function versionGreater (v2: string|undefined, v1: string|undefined) {
  if (v2 == null) return false
  if (v1 == null) return true
  return semver.gt(v2, v1)
}

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
  public cssblocks = new Map<string, { css: string, version?: string, map?: string }>()
  public jsblocks = new Map<string, { js: string, version?: string, map?: string }>()
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
  public schemaversion: Date
  public resourceversion: string

  addTemplate<T extends typeof Component> (template: T) {
    if (template instanceof Page) this.pages.set(template.templateKey, template as any)
    else this.components.set(template.templateKey, template as any)
    this.all.push(template)
    for (const [key, block] of template.jsBlocks().entries()) {
      const existing = this.jsblocks.get(key)
      if (!existing || versionGreater(block.version, existing.version)) this.jsblocks.set(key, block)
    }
    for (const [key, block] of template.cssBlocks().entries()) {
      const existing = this.cssblocks.get(key)
      if (!existing || versionGreater(block.version, existing.version)) this.cssblocks.set(key, block)
    }
    for (const block of this.cssblocks.values()) {
      const minified = minify(block.css, { sourceMap: true })
      block.css = minified.css
      block.map = minified.map!.toString()
    }
    for (const block of this.jsblocks.values()) {
      jsminify(block.js, { sourceMap: true }).then(minified => {
        block.js = minified.code ?? ''
        block.map = minified.map as string ?? ''
      }).catch(e => console.error(e))
    }
  }

  getTemplate (templateKey: string) {
    return this.pages.get(templateKey) ?? this.components.get(templateKey)
  }

  constructor () {
    this.schemaversion = new Date(readFileSync('/.builddate').toString('ascii').trim())
    this.resourceversion = String(Math.round(this.schemaversion.getTime()))
  }
}

export const templateRegistry = new TemplateRegistry()
