import { Level } from 'level'
import { zeroAddress } from 'viem'

import Trie, { bigintToBytes, bytesToBinary } from './trie'
import { hexToBytes } from '@noble/hashes/utils'

export const stateTrie = new Trie(
  new Level<boolean[], Uint8Array>('data/state-trie', {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
  }),
  [
    {
      key: bytesToBinary(hexToBytes(zeroAddress.substring(2))),
      value: bigintToBytes(1000000000000000000000000000n),
    },
  ],
)
