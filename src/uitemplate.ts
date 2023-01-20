import { ComponentData, PageData } from './component.js'

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

export interface UITemplate {
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
  defaultContent?: Record<string, ComponentData[]>

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
