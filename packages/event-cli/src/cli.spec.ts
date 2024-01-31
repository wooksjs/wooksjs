import { useRouteParams } from '@wooksjs/event-core'

import { createCliApp } from './cli-adapter'
import { useCliOptions } from './composables'

type TSpy = (flags: Record<string, string | boolean> | unknown) => void
const cmd1 = jest.fn() as TSpy
const cmd2 = jest.fn() as TSpy
const cmd3 = jest.fn() as TSpy

const app = createCliApp()
app.cli('cmd1', {
  handler: () => {
    cmd1(useCliOptions())
  },
})
app.cli('cmd2 test', {
  handler: () => {
    cmd2(useCliOptions())
  },
})
app.cli('cmd3/:v?', {
  handler: () => {
    cmd3(useRouteParams().get('v'))
  },
})

describe('event-cli', () => {
  it('must run simple commands', async () => {
    jest.clearAllMocks()
    await app.run('cmd1 -c test'.split(' '))
    expect(cmd1).toBeCalledTimes(1)
    expect(cmd1).toBeCalledWith({ _: ['cmd1'], c: 'test' })
    expect(cmd2).toBeCalledTimes(0)
    await app.run('cmd2 -cA test'.split(' '), { boolean: ['A'] })
    expect(cmd1).toBeCalledTimes(1)
    expect(cmd2).toBeCalledTimes(1)
    expect(cmd2).toBeCalledWith({ _: ['cmd2', 'test'], c: true, A: true })
  })
  it('must run commands with --no-flag', async () => {
    jest.clearAllMocks()
    await app.run('cmd1 --no-test'.split(' '), { boolean: ['test'] })
    expect(cmd1).toBeCalledTimes(1)
    expect(cmd1).toBeCalledWith({ _: ['cmd1'], test: false })
  })
  it('must run commands with optional var', async () => {
    jest.clearAllMocks()
    await app.run(['cmd3'])
    expect(cmd3).toBeCalledTimes(1)
    expect(cmd3).toBeCalledWith(undefined)
    jest.clearAllMocks()
    await app.run(['cmd3', 'test'])
    expect(cmd3).toBeCalledTimes(1)
    expect(cmd3).toBeCalledWith('test')
  })
})
