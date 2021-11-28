/* eslint-disable @typescript-eslint/no-extraneous-class */

/**
 * This class is a parent class for Component, but it can also be used as a standalone
 * if you are creating a set of templates with shared resources. This will be fairly
 * typical for each entity running an instance and creating their own local templates. You'll
 * probably want one place to set up very common resources like fontawesome or jquery, instead
 * of having each and every component template provide them again and again.
 *
 * If you do this, don't forget to register the provider along with your templates!
 */
export abstract class ResourceProvider {
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
   *
   * For convenience you can either provide the `css` property with the CSS as a string, or the
   * `path` property with the full server path to a CSS file (node's __dirname function will
   * help you determine it). You MUST provide one or the other.
   */
  static cssBlocks: Map<string, { css?: string, path?: string, version?: string }> = new Map()

  /**
   * Same as cssBlocks() but for javascript.
   */
  static jsBlocks: Map<string, { js?: string, path?: string, version?: string }> = new Map()

  /**
   * If your template needs to serve any files, like fonts or images, you can provide
   * a filesystem path in this static property and the files will be served by the rendering
   * server. Use the provided `webpaths` map to obtain the proper resource URLs. They will be
   * available as soon as your template has been registered to the rendering server's templateRegistry.
   *
   * Typically you will set this to something like `${__dirname}/static` so that the path will be relative
   * to where you are writing your template class.
   *
   * The map name you pick should be globally unique and only collide with other templates as
   * intended. For instance, the fontawesome font only needs to be provided once, even though
   * several templates might depend on it. Setting the name as 'fontawesome5' on all three
   * templates would ensure that the file would only be served once. Including the major version
   * number is a good idea only if the major versions can coexist.
   *
   * Include a version number if applicable for the file you've included with your source. If
   * multiple templates have a common file, the one that provides the highest version number will
   * have its file served, while the others will be ignored.
   *
   * DO NOT change the mime type without changing the name. Other templates could end up with
   * the wrong file extension.
   */
  static files: Map<string, { path: string, version?: string, mime: string }> = new Map()

  /**
   * Template code will need to generate HTML and CSS that points at the static files
   * provided above. In order to do so, we need information from the template registry (since
   * we have to deduplicate with other registered templates at startup time).
   *
   * In order to avoid an ES6 dependency on the registry, we will have the registry write
   * back to this map as templates are registered.
   *
   * Now when a template needs a web path to a resource to put into its HTML, it can do
   * `<img src="${TemplateClass.webpath('keyname')}">`
   */
  static webpaths: Map<string, string> = new Map()
  static webpath (name: string) { return this.webpaths.get(name) }
}
