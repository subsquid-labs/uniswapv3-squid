/**
 * Runs every phase of the indexer in order: pass 0, pass 1, ... then the
 * finalize step, then head.
 *
 * The passes have to be separate processes because each keeps its own progress
 * row and replays the same block range; a pass exits by itself once it reaches
 * the cutoff, and the head phase then runs until interrupted. The number of
 * passes comes from assets/pools.json, so this stays correct when the cutoff is
 * moved and the manifest is regenerated.
 *
 * Finalize sits between the two because the levels it computes are a prefix sum
 * over deltas that every pass contributes to: it needs the last pass to have
 * finished, and the head phase - which follows the chain for as long as it is
 * left running - never finishes. See src/tools/finalize.ts.
 */
import {spawn} from 'child_process'
import {manifest, phaseNames} from '../processor'

function runNode(script: string, args: string[] = []): Promise<void> {
    const label = [script, ...args].join(' ')
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--require=dotenv/config', script, ...args], {
            stdio: 'inherit',
            env: process.env,
        })
        child.on('error', reject)
        child.on('exit', (code, signal) => {
            if (signal) return reject(new Error(`${label} was killed by ${signal}`))
            if (code !== 0) return reject(new Error(`${label} exited with code ${code}`))
            resolve()
        })
    })
}

function runPhase(name: string): Promise<void> {
    return runNode('lib/main.js', [name])
}

async function main(): Promise<void> {
    const phases = phaseNames()
    console.log(`indexing in ${phases.length} phases up to cutoff ${manifest.height}: ${phases.join(', ')}`)

    for (const phase of phases.filter((p) => p !== 'head')) {
        console.log(`\n=== ${phase} ===`)
        await runPhase(phase)
    }

    console.log('\n=== finalize ===')
    await runNode('lib/tools/finalize.js')

    console.log('\n=== head ===')
    await runPhase('head')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
