import * as core from '@actions/core'

import { createBuilder } from './src/CreateActionBuilder'
import { BuilderConfigGetters } from './src/ActionBuilderBase'

const main = async () => {
  const configGetters = createConfigGetters()
  const actionBuilder = await createBuilder(process.cwd(), configGetters)

  await actionBuilder.build()
  await actionBuilder.saveActionConfig()
  await actionBuilder.cleanUp(core.getInput('excluded-from-cleanup', { required: true }).split(' '))

  const commitMessage = core.getInput('commit-message')
  if (commitMessage !== '') {
    await actionBuilder.configureGit(
      core.getInput('committer-name', { required: true }),
      core.getInput('committer-email', { required: true })
    )

    const pushBranch = core.getInput('push-branch')
    const releaseTags = core.getInput('release-tags').split(' ').filter(tag => tag !== '')
    await actionBuilder.commit(pushBranch, releaseTags, commitMessage)
    await actionBuilder.push(core.getInput('force-push', { required: true }) === 'true')
  }
}

const createConfigGetters = (): BuilderConfigGetters => {
  return {
    getJavaScriptBuildCommand: (required: boolean) => core.getInput(`js-build-command`, { required }),
    getDockerRegistry: (required: boolean) => core.getInput(`docker-registry`, { required }),
    getDockerLoginUser: (required: boolean) => core.getInput(`docker-user`, { required }),
    getDockerLoginToken: (required: boolean) => core.getInput(`docker-token`, { required }),
    getDockerImageRepoTag: (required: boolean) => core.getInput(`docker-repotag`, { required }),
    getDockerBuildCommand: (required: boolean) => core.getInput(`docker-build-command`, { required }),
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
