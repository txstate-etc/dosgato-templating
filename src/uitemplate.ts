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
   *   make a further graphql query based on its id/path.
   * - templateProperties: the template properties for the current page template, so you can make
   *   things like color pickers that visually match the colors of the current page template
   * - environmentConfig: base URLs in case you need to generate a link to the API or something
   */
  dialog?: new (...args: any[]) => any

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
}

/**
 * This is a type for the data that will be passed to dialog Svelte components as
 * the `page` prop.
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
export async function dialogQuery <T = any> (query: string, variables: any) {
  return await ((window as any).api.query(query, variables) as Promise<T>)
}
