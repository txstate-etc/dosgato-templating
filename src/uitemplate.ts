import type { ComponentData, DataData, PageData, DataRecord } from './component.js'

// extremely brief version of the IconifyIcon definition so we don't have to import
// the whole library, may need to keep this in sync with @iconify/svelte (currently 3.0.0)
interface IconifyIcon {
  body: string
  rotate?: number
  hFlip?: boolean
  vFlip?: boolean
  left?: number
  top?: number
  width?: number
  height?: number
}

// We're extending IconifyIcon here so that templates can provide a raw SVG
// instead of an IconifyIcon by puting the SVG contents into `body` and
// setting `raw` true.
export interface IconOrSVG extends IconifyIcon {
  raw?: true
}

export interface UITemplateBase {
  templateKey: string

  /**
   * A svelte component that expects to be inside a @dosgato/dialog Form component
   *
   * This dialog will be how editors interact with your component and edit its data. If you
   * do not provide a dialog, it will be assumed that this template has no data and it will be
   * inserted into the page without further user interaction.
   *
   * Several props are delivered to the svelte component that may be important for you:
   *
   * - creating: boolean, true when creating component for the first time, false when editing
   * - data: ComponentData, the current data on the page, should not be mutated during editing,
   *   undefined when creating
   * - page: DialogPageProp, the current page so that you can reference the full page data or
   *   make a further graphql query based on its id/path. Component dialogs only, page and data
   *   dialogs do not receive this prop
   * - templateProperties: the template properties for the current page template, so you can make
   *   things like color pickers that visually match the colors of the current page template.
   *   Data dialogs do not receive this.
   * - environmentConfig: base URLs in case you need to generate a link to the API or something
   *
   * In addition to the props, you may import the `dialogQuery` function (see below) to send
   * requests to the API.
   */
  dialog?: new (...args: any[]) => any

  /**
   * Sometimes it's useful for a component to have a stable but random identifier for use
   * during render. For instance, to set the id on an HTML element for reference by other
   * components or code.
   *
   * If your component has a dialog, dosgato-dialog has a <FieldIdentifier> component for this;
   * it's invisible but either creates or maintains a random string.
   *
   * If your component has no dialog but still needs an identifier, you can name a property
   * here and dosgato-admin will generate one for you upon creation.
   *
   * For example, `randomId: 'id'` means your component data will look like `{ id: 'cym87regpk' }`
   */
  randomId?: string

  /**
   * if present this SVG will be used when presenting users with
   * an array of choices of templates to create. Ideally it should look
   * a lot like the template will look on a webpage. It will be presented
   * about 1-2 inches wide
   */
  preview?: IconOrSVG

  /**
   * if present this icon will be used to represent the template in various
   * UI contexts. It will be presented about 3mm wide. Falls back to the
   * preview image.
   */
  icon?: IconOrSVG
}

export interface UITemplate extends UITemplateBase {
  /**
   * Sometimes when you create a component that has areas, you want to automatically fill
   * one or more areas with some default introductory content.
   *
   * You can place that introductory content here and it will be automatically placed into
   * components with this template upon creation (and never again).
   *
   * Whatever you put here will be added beneath the component's `areas` property, so it would
   * be structured like:
   * {
   *   someArea: [componentData1, componentData2],
   *   anotherArea: [componentData3]
   * }
   */
  defaultContent?: Record<string, ComponentData[]> | ((data: ComponentData) => Record<string, ComponentData[]>)

  /**
   * Add buttons to the page bar in the page editing UI when editing pages with this
   * template. Only applies to page templates.
   *
   * When clicked, the button will send a message to the page iframe. The message content
   * will contain the label, like this:
   *
   * { action: 'pagebar', label: 'yourlabel' }
   *
   * There should be code, generated by this template, that listens for such a message and
   * takes your desired action.
   */
  pageBarButtons?: {
    icon?: IconOrSVG
    label: string
    /**
     * Set true if the button should only appear as an icon. `label` is still required for
     * screen reader support.
     */
    hideLabel?: boolean
    /**
     * In case the button is irrelevant for certain pages, you may provide a function
     * that uses the page data and path to decide whether to show the button.
     */
    shouldAppear?: (data: PageData, path: string) => boolean
  }[]

  /**
   * Customize the device preview dropdown. Only applies to page templates. Default is to show
   * Mobile and Desktop in preview mode only.
   */
  devicePreview?: {
    /**
     * Set this to an object to customize the sizes available on the preview device dropdown.
     * Leave width undefined to use all available space. The first entry marked default will be
     * active on first page load. If none are default, the largest is default.
     * Example: [{ label: 'Mobile', width: 400 }, { label: 'Desktop', default: true }]
     */
    sizes?: { label: string, width?: number, default?: boolean }[]
    /**
     * If your template is heavily mobile focused, you may want editors to have the device
     * dropdown while editing, in addition to previewing. Set this true to enable that.
     */
    showWhileEditing?: boolean
  }
}

export interface ExtraDataColumn {
  /**
       * A title for the column in header row.
       */
  title: string
  /**
   * If given a string, will be treated as a dot-separated path within DataData and
   * the content at that path will be html-encoded and placed inside the field.
   *
   * If given a function, the result of the function will be placed inside the field
   * without html-encoding, so that you can write your own HTML. Do the encoding yourself.
   */
  get: string | ((data: DataData) => string)
  /**
   * An icon for the cell in all regular rows (not the header).
   */
  icon?: (data: DataData) => IconOrSVG | undefined
  /**
   * Set a fixed width for this column
   *
   * For example, "50px", "12em", or "10vw"
   */
  fixed?: string
  /**
   * Set a dynamic width for this column as a ratio of the name column
   *
   * For example, 0.5 = half the name column, 2 = double the name column
   */
  grow?: number
}

export interface UITemplateData extends UITemplateBase {
  /**
   * Add extra columns between name and published status.
   *
   * Without configuration, only data entry name, published status, and modified info
   * is shown in the list view.
   */
  columns?: ExtraDataColumn[]

  /**
   * It may be preferred to show the computeName source (e.g. title) instead of
   * showing the computed name itself in the leftmost column of the data tree.
   *
   * Provide this option to control the name column. Everything is optional in
   * case, for example, you only want to control the icon.
   */
  nameColumn?: {
    title?: string
    icon?: (data: DataData) => IconOrSVG | undefined
    get?: string | ((data: DataData) => string)
  }

  /**
   * Defines the responsive behavior of the list view, given a tree width. Should return an array with the titles of the extra columns that
   * should be shown at the given tree width, or an empty array if none should be shown. The behavior of the default columns is handled by the admin interface.
   */
  responsiveDataColumns?: (treeWidth: number) => string[]
}

/**
 * This is a type for the data that will be passed to dialog Svelte components as
 * the `page` prop. Note that page template dialogs do NOT receive this prop.
 */
export interface DialogPageProp {
  id: string
  path: string
  data: PageData
}

/**
 * A function you may use in your dialogs to make an authenticated graphql request to the DosGato
 * API.
 */
export async function dialogQuery <T = any> (query: string, variables?: any) {
  return await ((window as any).api.query(query, variables) as Promise<T>)
}

export interface TracingEnvironment {
  tracingServer: string
}

export interface TracingInterface {
  init?: (env: TracingEnvironment) => void
  startTransaction?: (name: string, details: any, env?: TracingEnvironment) => void
  endTransaction?: (name: string, details: any, env?: TracingEnvironment) => void
  event?: (name: string, details: any, env?: TracingEnvironment) => void
}

export interface BaseEvent {
  /** The larger UI area the user is interacting with that the event is emitted from.
   * @example 'ActionPanel', 'PageEditor', 'ComponentDialog' */
  eventType: string // How about renaming to `emitterContext`?

  /** The specific action the user took. Typically the label for the element that emits
   * the event.
   * @example 'Add Page', 'Edit Page', 'Preview', 'Cancel Preview' */
  action: string

  /** Additional data points specific to a particular event type's context. These should
   * be significant enough to understanding the event to merrit adding additional columns
   * in tools like elastic-search.
   * @warning This is NOT a catch-all property.
   * @example { hiddenLabel: action.hiddenLabel } // The aria label for an action element. */
  additionalProperties?: Record<string, string | undefined>
}

/** Events triggered by user interactions with interface elements in DosGato. This interface
 * is intended to provide a common model for succinctly expressing the contextually important
 * properties of these events to loggers that can be pointed to analytics and metrics services. */
export interface UserEvent extends BaseEvent {
  /** The page, screen, or dialog the user is looking at in which the associated event emitter is
   * in context to.
   * @example '/pages', '/pages/[id]', '/pages/[id]/dialog' */
  screen: string

  /** The target the emitted event is to trigger actions on.
   * Each page/screen, or dialog, needs to set their target for what events in it are targeted
   * to act on in in its context.
   *
   * For example: The page in the page tree of the Pages screen that ActionPanel actions,
   * such as edit or preview, will act on.
   * @example '/site3-sandbox/about' */
  target: string
}

interface AssetMetaDisplay {
  component: UITemplate['dialog']
  title: string
}

/**
 * A type for the config object that should be exported from a CMS instance's admin/local/index.js
 * to configure how that instance should work.
 */
export interface UIConfig {
  templates: UITemplate[]
  login: {
    /**
     * What to do when we get a 401 from the API. Generally we'll want to redirect
     * to our SSO login page. Since we use sveltekit we redirect by throwing:
     * `throw redirect(302, 'https://my.sso.org/login')`
     */
    handleUnauthorized: (environmentConfig: any) => void
    /**
     * When our SSO finishes and redirects the user back to us, we need to extract the token so
     * that we can save it in session storage.
     *
     * Many SSO services don't provide a token your API/render services can permanently accept. In that
     * case you need to create a login endpoint on the API or render service that can generate a token
     * your API and render service will accept and then redirect back to /.admin where this function can
     * retrieve the token.
     *
     * If this function is left undefined, we'll assume that you want cookies instead and don't want
     * to use sessionStorage. Note that BOTH the API and render services need to be sent the cookie,
     * so you need to redirect through them both to get the cookie created before finally redirecting
     * back to /.admin
     */
    getToken?: (info: { url: URL }) => string | undefined
    /**
     * If your SSO requires a single return URL, you may need to do more work to return the user to
     * where they were before they got a 401 that triggered a login. Maybe your SSO provides a passthrough
     * parameter for you to use; otherwise you can set the return url in sessionStorage or a cookie.
     *
     * Whatever strategy you pick, it begins in handleUnauthorized. You'll save your current location in that
     * function (by whatever means you choose), and then after the user has been redirected around a bit, you'll
     * read what you saved in this function and return the URL. dosgato-admin will redirect for you.
     */
    getRedirect?: (info: { url: URL }) => string | undefined
    /**
     * If you do not provide a logout function, we will simply destroy the token in sessionStorage and
     * refresh the page, which should trigger a 401 from the API, which should in turn trigger a redirect
     * to the login page.
     *
     * If you use cookies or if your SSO provider uses cookies and would immediately log the user back in,
     * then you need to visit a logout endpoint instead of refreshing.
     *
     * Since we use sveltekit, you trigger navigation with `goto('https://my.sso.org/logout')`
     */
    logout?: (environmentConfig: any, token: string) => void
  }
  /**
   * Optional CMS logo to be placed in the top left of the admin UI. Function can be used if the logo depends
   * on the environment.
   */
  logo?: IconOrSVG | (() => IconOrSVG) | undefined
  /**
   * Optional favicon. Function can be used if the logo depends on the environment.
   */
  favicon?: string | ((environmentConfig: any) => string) | undefined
  /**
   * Optional function to determine whether the admin UI is running in a non-PROD environment
   * like QUAL or DEV or STAGING or whatever identifier you want to use.
   *
   * The string you return will be visually represented in the UI so that editors are clear about
   * which environment they are working in.
   */
  environmentTitle?: (environmentConfig: any) => string | undefined
  /**
   * Page title for the <head>
   */
  title?: string
  /**
   * If you would like to collect more information about assets from editors, you may provide a dialog
   * here. The data collected will be available when you retrieve assets.
   */
  assetMeta?: {
    dialog: UITemplate['dialog']

    /**
     * If you provide an assetMeta.dialog to collect extra details about each asset, you'll probably want to
     * display those details on the asset detail screen. Provide this function to return a map of detail
     * keys and values to be displayed alongside the other vitals like asset name, size, type, etc. Insertion
     * order will be maintained.
     */
    details?: (data: any) => Record<string, string>

    /**
     * If you provide an assetMeta.dialog to collect extra details about each asset, you may want to use
     * assetMeta.details to show some of it, and/or you may want your own box on the detail page to do something
     * cool and custom. Provide a svelte component here and it will be passed the asset object with all of
     * its metadata so that you can draw whatever you like. Your content will be placed inside a box titled
     * with the title property.
     *
     * Provide an array to be given multiple boxes.
     */
    display?: AssetMetaDisplay | AssetMetaDisplay[]
  }

  trainings?: {
    noEdit?: boolean
    hide?: boolean
  }

  tracing?: TracingInterface

  /** Non-Awaited async call for logging interface interactions if defined.
   * Useful for defining how to log form submissions, interaction clicks, page edits, or state
   * changes of different interfaces. Can be directed to separate endpoint for APM logging as
   * long as that POST is also non-awaited. */
  uiInteractionsLogger?: (info: UserEvent, environmentConfig: any) => void
}
