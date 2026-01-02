/**
 * Custom HTTPS Server for Next.js Development
 * Enables SSL/TLS for local development
 */

const { createServer } = require('https')
const { parse } = require('url')
const next = require('next')
const fs = require('fs')
const path = require('path')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

// SSL Certificate paths
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'localhost.crt')),
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, () => {
      console.log(`> Ready on https://${hostname}:${port}`)
    })
})
