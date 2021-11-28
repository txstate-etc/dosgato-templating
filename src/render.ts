// recursive helper function to traverse a hydrated page and return a flat array

import { IncomingHttpHeaders } from 'http'
import { Component, PageRecord, PageWithAncestors } from './component'
import { templateRegistry } from './registry'
import { ComponentData } from './sharedtypes'
import { resourceversion } from './version'

// of Component instances
function collectComponents (component: Component) {
  const ret = [component] as Component<ComponentData>[]
  for (const areaList of component.areas.values()) {
    for (const component of areaList) {
      ret.push(...collectComponents(component))
    }
  }
  return ret
}

// recursive helper function for the context phase of rendering (phase 2)
function executeSetContext (editMode: boolean) {
  const setContextFn = async (component: Component) => {
    const components = Array.from(component.areas.values()).flat()
    await Promise.all(components.map(async c => {
      try {
        if (!c.hadError) c.renderCtx = await c.setContext(component.renderCtx, editMode)
      } catch (e: any) {
        c.logError(e)
      }
      await setContextFn(c)
    }))
  }
  return setContextFn
}

// recursive helper function for the final render phase of rendering (phase 3)
function renderComponent (editMode: boolean) {
  const renderFn = (component: Component) => {
    if (component.hadError) return ''
    const renderedAreas = new Map<string, string[]>()
    for (const [key, list] of component.areas) {
      const areaList = list.map(renderFn)
      renderedAreas.set(key, areaList)
    }
    try {
      return component.render(renderedAreas, editMode)
    } catch (e: any) {
      component.logError(e)
      return ''
    }
  }
  return renderFn
}

// recursive helper function for rendering a variation of a page
function renderVariation (extension: string) {
  const renderFn = (component: Component) => {
    if (component.hadError) return ''
    const renderedAreas = new Map<string, string>()
    for (const [key, list] of component.areas) {
      const areaList = list.map(renderFn)
      renderedAreas.set(key, areaList.join(''))
    }
    try {
      return component.renderVariation(extension, renderedAreas)
    } catch (e: any) {
      component.logError(e)
      return ''
    }
  }
  return renderFn
}

function hydrateComponent (componentData: ComponentData, parent: Component, path: string) {
  // find the page implementation in the registry
  const ComponentType = templateRegistry.components.get(componentData.templateKey)
  if (!ComponentType) return parent.logError(new Error(`Template ${componentData.templateKey} is in the page data but no template code has been registered for it.`))

  // hydrate the page data into full objects
  const component = new ComponentType(componentData, path, parent)
  for (const key of Object.keys(componentData.areas)) {
    const areaComponents: Component[] = []
    for (let i = 0; i < componentData.areas[key].length; i++) {
      const child = hydrateComponent(componentData.areas[key][i], component, `${path}/${key}/${i}`)
      if (child) areaComponents.push(child)
    }
    component.areas.set(key, areaComponents)
  }
  return component
}

// helper function to convert a non-hydrated page into a hydrated page
// in other words, the input to this function is a raw JSON object, as stored in the
// database, and the output is a Page object, containing many Component objects, all
// of which are ready with the properties and methods defined above to support the rendering
// process
function hydratePage (pageData: PageRecord) {
  // find the page implementation in the registry
  const PageType = templateRegistry.pages.get(pageData.data.templateKey)
  if (!PageType) throw new Error('Unable to render page. Missing template implementation.')

  // hydrate the page data into full objects
  const page = new PageType(pageData)
  for (const key of Object.keys(pageData.data.areas)) {
    const areaComponents: Component[] = []
    for (let i = 0; i < pageData.data.areas[key].length; i++) {
      const child = hydrateComponent(pageData.data.areas[key][i], page, `${key}/${i}`)
      if (child) areaComponents.push(child)
    }
    page.areas.set(key, areaComponents)
  }
  return page
}

function editModeIncludes () {
  return '' // TODO: include script and css to support implementation of edit bars
}

/**
 * This function represents the entire rendering process. It takes a non-hydrated page (plus
 * the non-hydrated data for its ancestors, to support inheritance) and returns an HTML
 * string.
 *
 * Any migrations should be completed before rendering a page. They probably already happened
 * in the API Server.
 */
export async function renderPage (requestHeaders: IncomingHttpHeaders, page: PageWithAncestors, extension: string, editMode = false) {
  const pageComponent = hydratePage(page)
  const componentsIncludingPage = collectComponents(pageComponent)

  // execute the fetch phase
  await Promise.all(componentsIncludingPage.map(async c => {
    try {
      c.fetched = await c.fetch(editMode)
    } catch (e: any) {
      c.logError(e)
    }
  }))

  // if this is a variation, go ahead and render after the fetch phase
  if (extension && extension !== 'html') {
    return renderVariation(extension)(pageComponent)
  }

  // execute the context phase
  pageComponent.renderCtx = await pageComponent.setContext({ headerLevel: 1, requestHeaders }, editMode)
  await executeSetContext(editMode)(pageComponent)

  // provide content for the <head> element and give it to the page component
  pageComponent.headContent = (editMode ? editModeIncludes() : '') + [
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.jsBlocks()))).map(name => `<script src="/.resources/${resourceversion}/${name}.js"></script>`),
    ...Array.from(new Set(componentsIncludingPage.flatMap(r => r.cssBlocks()))).map(name => `<link rel="stylesheet" href="/.resources/${resourceversion}/${name}.css">`)
  ].join('\n')

  // execute the render phase
  return renderComponent(editMode)(pageComponent)
}
