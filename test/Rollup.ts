import { loadFixture } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers'
import { expect } from 'chai'
import { viem } from 'hardhat'
import { bigintToBytes, bytesToBinary, hash } from '../app/trie'
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils'
import Tx, { txTrie } from '../app/tx'
import { Hex, zeroAddress } from 'viem'
import { stateTrie } from '../app/state'

describe('contract', function () {
  async function deployFixture() {
    const rollup = await viem.deployContract('Rollup')
    const [alice, bob] = await viem.getWalletClients()
    await stateTrie.reset()
    await txTrie.reset()
    return { rollup, alice, bob }
  }

  describe('fraud proof', function () {
    it('challenge', async function () {
      const { rollup, alice, bob } = await loadFixture(deployFixture)

      // Lock
      const lock = Tx.encode({
        from: zeroAddress,
        to: alice.account.address,
        amount: 1000n,
        witness: `0x${bytesToHex(randomBytes(32))}`,
      })
      await txTrie.put(bytesToBinary(lock.txId), lock.data)
      await stateTrie.put(
        bytesToBinary(hexToBytes(zeroAddress.substring(2))),
        bigintToBytes(1000000000000000000000000000n - lock.amount),
      )
      await stateTrie.put(
        bytesToBinary(hexToBytes(alice.account.address.substring(2))),
        bigintToBytes(lock.amount),
      )
      let prev: `0x${string}` = await rollup.read.latest()
      let root: Hex = `0x${bytesToHex(
        hash({
          left: hexToBytes(prev.substring(2)),
          right: hash({
            left: await txTrie.root(),
            right: await stateTrie.root(),
          }),
        })!,
      )}`
      await rollup.write.propose([root, prev, [lock.decode()]])
      const locked = await rollup.read.latest()
      console.log('locked', locked)

      // Bob's prev proof
      const [, ...prevProof] = await stateTrie.prove(
        bytesToBinary(hexToBytes(bob.account.address.substring(2))),
      )
      const prevStateProof = [
        ...prevProof,
        await txTrie.root(),
        hexToBytes(prev.substring(2)),
      ].map((e) => (!e ? '' : `0x${bytesToHex(e)}`) as `0x${string}`)

      // Fraud
      const fraud = Tx.encode({
        from: alice.account.address,
        to: bob.account.address,
        amount: lock.amount,
        witness: `0x${bytesToHex(randomBytes(32))}`,
      })
      await txTrie.put(bytesToBinary(fraud.txId), fraud.data)
      await stateTrie.put(
        bytesToBinary(hexToBytes(alice.account.address.substring(2))),
        bigintToBytes(lock.amount - fraud.amount),
      )
      await stateTrie.put(
        bytesToBinary(hexToBytes(bob.account.address.substring(2))),
        bigintToBytes(fraud.amount), // Fraud here
      )
      prev = await rollup.read.latest()
      root = `0x${bytesToHex(
        hash({
          left: hexToBytes(prev.substring(2)),
          right: hash({
            left: await txTrie.root(),
            right: await stateTrie.root(),
          }),
        })!,
      )}`
      await rollup.write.propose([root, prev, [fraud.decode()]])
      const frauded = await rollup.read.latest()
      console.log('frauded', frauded)

      // Bob's next proof
      const [, ...nextProof] = await stateTrie.prove(
        bytesToBinary(hexToBytes(bob.account.address.substring(2))),
      )
      const nextStateProof = [
        ...nextProof,
        await txTrie.root(),
        hexToBytes(prev.substring(2)),
      ].map((e) => (!e ? '' : `0x${bytesToHex(e)}`) as `0x${string}`)

      // Bob's transaction proof
      const [, ...txProof] = await txTrie.prove(bytesToBinary(fraud.txId))
      const transactionProof = [
        ...txProof,
        await stateTrie.root(),
        hexToBytes(prev.substring(2)),
      ].map((e) => (!e ? '' : `0x${bytesToHex(e)}`) as `0x${string}`)

      // Challenge
      await rollup.write.challenge([
        frauded,
        {
          key: [
            ...bytesToBinary(hexToBytes(bob.account.address.substring(2))),
            true,
            true,
          ],
          value: '' as `0x${string}`,
        },
        prevStateProof,
        {
          key: [...bytesToBinary(fraud.txId), false, true],
          value: `0x${bytesToHex(fraud.data)}`,
        },
        transactionProof,
        {
          key: [
            ...bytesToBinary(hexToBytes(bob.account.address.substring(2))),
            true,
            true,
          ],
          value: `0x${bytesToHex(bigintToBytes(fraud.amount))}`,
        },
        nextStateProof,
      ])

      // Check block rollback
      const latest = await rollup.read.latest()
      expect(latest).equals(locked)
    })
  })
})
