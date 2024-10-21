import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const RollupModule = buildModule('RollupModule', (m) => {
  const rollup = m.contract('Rollup')
  return { rollup }
})

export default RollupModule
