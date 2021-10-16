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
    this.app.get<{ Params: { '*': string, siteId: string, pagetreeId: string, version: string }, Querystring: { token?: string } }>(
      '/.preview/:siteId/:pagetreeId/:version/*',
      async req => {
        const { path, extension } = parsePath(req.params['*'])
        const published = req.params.version === 'public' ? true : undefined
        const version = published ? undefined : (parseInt(req.params.version) || undefined)
        const page = await api.getPreviewPage(getToken(req), req.params.siteId, req.params.pagetreeId, path, templateRegistry.schemaversion, published, version)
        if (!page) throw new HttpError(404)
        return await renderPage(page, extension, false)
      })
    this.app.get<{ Params: { '*': string, siteId: string, pagetreeId: string, version: string }, Querystring: { token?: string } }>(
      '/.edit/:siteId/:pagetreeId/*',
      async req => {
        const { path, extension } = parsePath(req.params['*'])
        const page = await api.getPreviewPage(getToken(req), req.params.siteId, req.params.pagetreeId, path, templateRegistry.schemaversion)
        if (!page) throw new HttpError(404)
        return await renderPage(page, extension, true)
      })
    this.app.get<{ Params: { '*': string, templateKey: string, ext: string } }>('/.resources/:templateKey/:ext', async (req, res) => {
      const template = templateRegistry.getTemplate(req.params.templateKey) as any
      if (!template) throw new HttpError(404)
      if (req.params.ext === 'css') return template.css
      else if (req.params.ext === 'js') return template.javascript
      throw new HttpError(404)
    })
    this.app.get<{ Params: { '*': string } }>('*', async req => {
      const { path, extension } = parsePath(req.params['*'])

      const page = await api.getLaunchedPage(req.hostname, path, templateRegistry.schemaversion)
      if (!page) throw new HttpError(404)
      return await renderPage(page, extension, false)
    })
  }
}
