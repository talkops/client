#!/usr/bin/env node

import { createServer } from 'net'
import { EventSource } from 'eventsource'
import { Tail } from 'tail'
import { unlink } from 'fs/promises'

const config = JSON.parse(Buffer.from(process.env.TALKOPS_TOKEN, 'base64').toString())
const esUrl = `${config.url}?topic=${encodeURIComponent(config.subscriber.topic)}`

async function sub(socket) {
  const es = new EventSource(esUrl, {
    fetch: (input, init = {}) =>
      fetch(input, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${config.subscriber.token}`,
        },
      }),
  })
  es.addEventListener('message', (message) => {
    socket.write(message.data)
  })
  es.onerror = () => {
    es.close()
    setTimeout(() => sub(socket), 1000)
  }
}

async function tail() {
  new Tail(process.env.TALKOPS_STDERR).on('line', (data) => {
    pub(
      JSON.stringify({
        data,
        time: new Date().getTime(),
        type: 'stderr',
      }),
    )
  })
  new Tail(process.env.TALKOPS_STDOUT).on('line', (data) => {
    pub(
      JSON.stringify({
        data,
        time: new Date().getTime(),
        type: 'stdout',
      }),
    )
  })
}

async function pub(data) {
  fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.publisher.token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      topic: config.publisher.topic,
      data,
    }),
  })
}

async function heartbeat() {
  pub('')
  setTimeout(heartbeat, 1000)
}

async function main() {
  unlink(process.env.TALKOPS_SOCKET)
  createServer()
    .listen(process.env.TALKOPS_SOCKET)
    .on('connection', (socket) => {
      socket.on('data', (data) => {
        pub(data.toString())
      })
      sub(socket)
    })
  heartbeat()
  tail()
}

main()
