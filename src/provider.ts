/* eslint-disable @typescript-eslint/no-extraneous-class */

export interface CSSBlock {
  /**
   * The CSS as a string. Provide either this or `path`.
   */
  css?: string
  /**
   * A file path to the CSS. The rendering server will read the file on startup.
   *
   * Typically you will set this with import.meta.url so that the path will be relative
   * to the javascript code where you are writing your template class:
   * path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/mystyles.css')
   */
  path?: string
  /**
   * This CSS is actually SASS and requires a compile. The rendering server will
   * perform the compilation on startup.
   */
  sass?: boolean
  /**
   * This CSS is intended to alter edit/new bar styles.
   *
   * Edit, Inherit, and New bars use web components with shadow DOM to ensure none of your
   * templates' page styles leak in and alter them. This is good, but it means you cannot
   * alter edit bars with page template CSS.
   *
   * Set this flag true and depend on the CSS block in your Component.cssBlocks() method as
   * normal. This block will automatically be included inside the shadow DOM of each bar, instead
   * of being included in the page's head.
   *
   * Note that this CSS will be present in all edit bars, not just the ones that have it in their
   * Component.cssBlocks() method. Use the `extraClass` option when generating bars to help you
   * target something specific.
   */
  targetsEditBars?: boolean
  /**
   * A version string following SEMVER. If multiple blocks are provided with the same name,
   * the one with the highest version number will be chosen. If blocks of different major
   * versions are provided, an alert will appear in the log.
   */
  version?: string
  /**
   * The CSS provided by this block applies to elements that are not on screen at
   * page load, i.e. modals and dialogs.
   *
   * Setting it true will improve our time-to-first-paint, but any CSS that does
   * apply to elements on screen at page load will cause a visible re-render that
   * may disturb the user.
   */
  async?: boolean
}

export interface JSBlock {
  /**
   * The javascript as a string. Provide either this or `path`.
   */
  js?: string
  /**
   * A file path to the javascript. The rendering server will read the file on startup.
   *
   * Typically you will set this with import.meta.url so that the path will be relative
   * to the javascript code where you are writing your template class:
   * path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/myscript.js')

   */
  path?: string
  /**
   * A version string following SEMVER. If multiple blocks are provided with the same name,
   * the one with the highest version number will be chosen. If blocks of different major
   * versions are provided, an alert will appear in the log.
   */
  version?: string
  /**
   * The javascript provided by this block does not need to run before the DOM finishes
   * loading. For instance, if the javascript only places event listeners and does not
   * modify the DOM or create globals on first run, it is eligible for this flag.
   *
   * Setting it true will improve our time-to-first paint, but any DOM manipulations on
   * first run will cause visible repaints that may disturb the user.
   *
   * Additionally, you cannot depend on load order of any async JS, so libraries like
   * jquery that create globals intended for later use must be loaded synchronously
   * (unless their dependents are smart enough to wait for the global to be defined).
   */
  async?: boolean
  /**
   * Do not treat this script like a module
   *
   * By default we set the `type="module"` attribute on script tags. Mostly what this will do is ensure
   * your top-level variables don't accidentally pollute the global scope. You would need to do
   * `window.myVar =` instead of `const myVar =`.
   *
   * If your script is full of intentional globals and you don't want to refactor it, you can set
   * this to false.
   *
   * This is also useful for frameworks like jQuery or prototype to ensure that they are executed
   * immediately instead of just before DOMContentLoaded. jQuery in particular behaves poorly when
   * you combine `type="module"` or `defer` with jQuery(document).ready().
   */
  nomodule?: boolean
}

export interface FileDeclaration {
  /**
   * The path to the file.
   *
   * Typically you will set this with import.meta.url so that the path will be relative
   * to the javascript code where you are writing your template class:
   * path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static/myfont.ttf')
   */
  path: string
  /**
   * A version string following SEMVER. If multiple files are provided with the same name,
   * the one with the highest version number will be chosen.
   */
  version?: string
  /**
   * The mime type of the file. If omitted, it will be automatically detected from the
   * file data.
   *
   * If needed, you may also specify a non-default charset with e.g. `text/html; charset=ascii`
   */
  mime?: string
}

export interface SCSSInclude {
  /**
   * The SASS code as a string. This SCSS should generally only include functions
   * and mixins. Regular CSS should be included as its own block so it can be de-duplicated.
   *
   * Variables don't make much sense because we only have one version of a block every
   * time it's used, whereas variables usually change from page template to page template.
   * Use CSS variables instead.
   */
  scss?: string
  /**
   * A file path to the SASS code.
   */
  path?: string
  /**
   * A version string following SEMVER. If multiple blocks are provided with the same name,
   * the one with the highest version number will be chosen. If blocks of different major
   * versions are provided, an alert will appear in the log.
   */
  version?: string
}

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
   * `path` property with the full server path (NOT URL) to a CSS file (node's __dirname function will
   * help you determine it). You MUST provide one or the other.
   *
   * You may also set `async` to true if a css block is not needed for the initial render of
   * the page. For instance, if your component has a modal that the user can trigger, you can
   * defer the CSS for that modal since it will not be needed until the page has gone interactive
   * and the user has clicked something.
   */
  static cssBlocks: Map<string, CSSBlock> = new Map()

  /**
   * A template can provide SASS mixins and functions for use by other SASS-based CSS
   * blocks.
   *
   * These includes can be utilized by other SASS with the SASS `@use` and `@include`
   * commands, e.g.
   * ```
   * @use 'my-mixin-name' as mx;
   * .someclass { @include mx.somemixin(); }
   * ```
   * In this case `my-mixin-name` is the key used for this Map.
   */
  static scssIncludes: Map<string, SCSSInclude> = new Map()

  /**
   * Same as cssBlocks() but for javascript.
   *
   * In this case `async` is much more useful, as most javascript is interactive and could run
   * after the page renders. Any code that adds event observers or the like should be marked with
   * async to improve the initial render time.
   */
  static jsBlocks: Map<string, JSBlock> = new Map()

  /**
   * If your template needs to serve any files, like fonts or images, you can provide
   * a filesystem path in this static property and the files will be served by the rendering
   * server. Use the provided `webpaths` map to obtain the proper resource URLs. They will be
   * available as soon as your template has been registered to the rendering server's templateRegistry.
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
  static files: Map<string, FileDeclaration> = new Map()

  /**
   * Template code will need to generate HTML and CSS that points at the static files
   * provided above. In order to do so, we need information from the template registry (since
   * we have to deduplicate with other registered templates at startup time, and the structure
   * of the webpath in general is the render server's concern).
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
