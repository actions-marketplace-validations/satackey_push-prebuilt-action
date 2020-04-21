const core = require('@actions/core')
const exec = require('actions-exec-listener')
const fs = require('fs')
const yaml = require('js-yaml')
const rimraf = require('rimraf')
// const ncc = require('./node_modules/@zeit/ncc/src/index.js')

const exists = path => {
  try {
    fs.statSync(`${process.cwd()}/${path}`);
    return true
  } catch (e) {
    if (!e.message.includes('no such file or directory')) {
      throw e
    }

    return false
  }
}

const configureGit = async () => {
  core.startGroup('git config')
  await exec.exec('git config --global user.name github-actions')
  await exec.exec('git config --global user.email actions@github.com')
  core.endGroup()
}

const installNcc = async () => {
  core.startGroup('npm install -g @zeit/ncc')
  await exec.exec('npm install -g @zeit/ncc')
  core.endGroup()
}

const installWithNpm = async () => {
  core.startGroup('npm install')
  await exec.exec('npm install')
  core.endGroup()
}

const installWithNpmStrictly = async () => {
  core.startGroup('npm ci')
  await exec.exec('npm ci')
  core.endGroup()
}

const installWithYarnStrictly = async () => {
  core.startGroup('yarn install --frozen-lockfile --non-interactive')
  await exec.exec('yarn install --frozen-lockfile --non-interactive')
  core.endGroup()
}

const installDependencies = async () => {
  const log = (file, pkg ,level='info') => `${level}: ${file} found. Install dependencies with ${pkg}.`

  if (!exists('package.json')) {
    throw new Error('error: package.json not found.')
  }

  if (exists('package-lock.json')) {
    console.log(log('package-lock.json', 'npm'))
    await installWithNpmStrictly()
    return
  }

  if (exists('yarn.lock')) {
    console.log(log('yarn.lock', 'yarn'))
    await installWithYarnStrictly()
    return
  }

  console.warn(log('package-lock.json or yarn.lock not', 'npm', 'warn'))
  await installWithNpm()
}

const buildAction = async command => {
  const readActionConfig = () => {
    let path = ''
  
    if (exists('action.yml')) {
      path = 'action.yml'
    } else if (exists('action.yaml')) {
      path = 'action.yaml'
    } else {
      throw new Error('error: action.yml or action.yaml not found.')
    }
  
    const actionConfig = yaml.safeLoad(fs.readFileSync(path, 'utf8'))
  
    return {
      path, actionConfig
    }
  }
  
  const getMainFileFrom = actionConfig => {
    if (actionConfig == null || actionConfig.runs == null){
      throw new Error(`error: Key run.main doesn't exist.`)
    }
  
    if (typeof actionConfig.runs.main !== 'string'){
      throw new Error(`error: run.main is ${typeof actionConfig.runs.main}, not string.`)
    }
  
    return actionConfig.runs.main
  }
  
  const build = async (file, cmd) => {
    /*
    const distMain = `dist/${file}`
    core.startGroup('ncc build')
    const { code, assets } = await ncc(`${process.cwd()}/${file}`, {
      cache: false,
      minify: true,
      v8cache: true,
    })

    const distFiles = {}
    distFiles[file] = code
    Object.entries(assets).forEach(([key, asset]) => {
      distFiles[key] = asset.source
    })

    Object.entries(distFiles).forEach(([key, value]) => {
      // https://stackoverflow.com/questions/818576/get-directory-of-a-file-name-in-javascript
      const saveDir = key.split('/').reverse().splice(1).reverse().join('/')
      console.log(`dist/${saveDir}`)
      fs.mkdirSync(`dist/${saveDir}`, { recursive: true })
      fs.writeFileSync(`dist/${key}`, value, 'utf8')
    })
    */

    const distMain = 'dist/index.js'
    let execCmd
    if (cmd === '') {
      // If build command not specified
      execCmd = `ncc build ${file} --v8-cache`
    } else {
      execCmd = cmd
    }

    await exec.exec(cmd)

    return distMain
  }
  
  const save = (config, saveAs) => {
    const yamlText = yaml.dump(config)
    fs.writeFileSync(saveAs, yamlText, 'utf8')
  }

  const { actionConfig, path } = readActionConfig()
  const mainfile = await getMainFileFrom(actionConfig)
  actionConfig.runs.main = await build(mainfile, command)
  save(actionConfig, path)

  return path
}

const clean = (...excludePaths) => {
  core.startGroup('clean files')
  const ls = fs.readdirSync('.')
  const leaves = [...excludePaths, '.git', 'dist']
  const toBeRemoved = ls.filter(path => !leaves.includes(path))
  console.log({ ls, leaves, toBeRemoved })
  toBeRemoved.forEach(path => rimraf.sync(path))
  core.endGroup()
}

const push = async (branch, tags, message) => {
  core.startGroup('git')
  await exec.exec('git checkout -b ', [branch])
  await exec.exec('git add .')
  await exec.exec('git commit -m', message)
  console.log(tags)
  if (tags.length > 0) {
    await exec.exec('git tag', tags)
  }
  await exec.exec('git push -f -u origin', [branch, '--follow-tags'])
  core.endGroup()
}

const main = async () => {
  // const ref = core.getInput('ref', { required: true })

  // // refs/heads/master → master
  // const branch = ref.split('/').slice(-1)[0]

  const releaseBranch = core.getInput('push-branch', { required: true })

  const tags = typeof core.getInput('release-tags') === 'string' && core.getInput('release-tags').length > 0
    ? core.getInput('release-tags').split(' ') : []
  const cmd = typeof core.getInput('build-cmd') === 'string' ? core.getInput('build-cmd') : ''

  const commitMessage = core.getInput('commit-message', { required: true })

  await configureGit()
  await installNcc()
  await installDependencies()
  const builtFiles = await buildAction(cmd)
  clean(builtFiles)
  await push(releaseBranch, tags, commitMessage)
}

main().catch(e => {
  console.error(e)
  core.setFailed(e.message || JSON.stringify(e))
})
