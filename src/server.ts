import { FastifyRequest } from 'fastify'
import cookie from 'fastify-cookie'
import Server, { FastifyTxStateOptions, HttpError } from 'fastify-txstate'
import { api } from './api'
import { Component, renderPage } from './component'
import { templateRegistry } from './registry'
import { parsePath } from './util'

function getToken (req: FastifyRequest<{ Querystring: { token?: string }}>) {
  const header = req.headers.authorization?.split(' ') ?? ['Bearer', '']
  if (header[0] === 'Bearer') return header[1]
  return req.query?.token ?? req.cookies.token ?? ''
}

class RenderingServer extends Server {
  constructor (config: FastifyTxStateOptions) {
    super(config)
    void this.app.register(cookie)

    /**
     * Route for preview renders - no edit bars, no anonymous access
     */
    this.app.get<{ Params: { '*': string, pagetreeId: string, version: string }, Querystring: { token?: string } }>(
      '/.preview/:pagetreeId/:version/*',
      async req => {
        const { path, extension } = parsePath(req.params['*'])
        const published = req.params.version === 'public' ? true : undefined
        const version = published ? undefined : (parseInt(req.params.version) || undefined)
        const page = await api.getPreviewPage(getToken(req), req.params.pagetreeId, path, templateRegistry.schemaversion, published, version)
        if (!page) throw new HttpError(404)
        return await renderPage(req.headers, page, extension, false)
      }
    )

    /**
     * Route for editing renders - has edit bars, no anonymous access
     */
    this.app.get<{ Params: { '*': string, pagetreeId: string, version: string }, Querystring: { token?: string } }>(
      '/.edit/:pagetreeId/*',
      async req => {
        const { path, extension } = parsePath(req.params['*'])
        const page = await api.getPreviewPage(getToken(req), req.params.pagetreeId, path, templateRegistry.schemaversion)
        if (!page) throw new HttpError(404)
        return await renderPage(req.headers, page, extension, true)
      }
    )

    /**
     * Route for fetching CSS and JS from our registered templates, anonymous OK
     */
    this.app.get<{ Params: { '*': string, version: string, blockName: string, ext: string } }>('/.resources/:version/:blockName.:ext', async (req, res) => {
      const block = req.params.ext.includes('css')
        ? templateRegistry.cssblocks.get(req.params.blockName)
        : templateRegistry.jsblocks.get(req.params.blockName)
      if (!block) throw new HttpError(404)
      await res.header('Cache-Control', 'max-age=31536000, immutable')
      if ('css' in block && req.params.ext === 'css') {
        await res.type('text/css')
        if ((block.map?.length ?? 0) > 0) await res.header('SourceMap', `/.resources/${req.params.version}/${req.params.blockName}.css.map`)
        return block.css
      } else if ('js' in block && req.params.ext === 'js') {
        await res.type('text/javascript')
        if ((block.map?.length ?? 0) > 0) await res.header('SourceMap', `/.resources/${req.params.version}/${req.params.blockName}.js.map`)
        return block.js
      } else if (req.params.ext === 'css.map') {
        return block.map ?? ''
      } else if (req.params.ext === 'js.map') {
        return block.map ?? ''
      }
      throw new HttpError(404)
    })

    /**
     * Route to serve launched web pages to anonymous users
     */
    this.app.get<{ Params: { '*': string } }>('*', async req => {
      const { path, extension } = parsePath(req.params['*'])

      const page = await api.getLaunchedPage(req.hostname, path, templateRegistry.schemaversion)
      if (!page) throw new HttpError(404)
      return await renderPage(req.headers, page, extension, false)
    })
  }
}
