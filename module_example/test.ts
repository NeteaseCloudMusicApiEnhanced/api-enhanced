import { banner, lyric } from '@neteasecloudmusicapienhanced/api'
import type { Response } from '@neteasecloudmusicapienhanced/api'
import logger from '../util/logger.js'
banner({ type: 0 }).then((res: Response) => {
  logger.info(res)
})
lyric({
  id: '33894312',
}).then((res: Response) => {
  logger.info(res)
})
