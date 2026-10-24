import { Config } from '@remotion/cli/config'

// The end card draws with WebGL 2, which Chrome's default renderer here does not provide.
Config.setChromiumOpenGlRenderer('angle')
