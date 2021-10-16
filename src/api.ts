import AgentKeepAlive from 'agentkeepalive'
import axios from 'axios'
import { PageWithAncestors } from './component'

class Api {
  client = axios.create({
    baseURL: process.env.DOSGATO_API_URL,
    httpAgent: new AgentKeepAlive(),
    httpsAgent: new AgentKeepAlive.HttpsAgent(),
    headers: {
      Authorization: `Bearer ${process.env.DOSGATO_API_TOKEN ?? ''}`
    }
  })

  async getLaunchedPage (hostname: string, path: string, schemaversion: Date): Promise<PageWithAncestors|undefined> {
    // TODO
    return {} as any
  }

  async getPreviewPage (token: string, siteId: string, pageTreeId: string, path: string, schemaversion: Date, published?: true, version?: number): Promise<PageWithAncestors|undefined> {
    return {} as any
  }
}

export const api = new Api()
