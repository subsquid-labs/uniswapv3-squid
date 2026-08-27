/**
 * Runs every phase of the indexer in order: pass 0, pass 1, ... then head.
 *
 * The passes have to be separate processes because each keeps its own progress
 * row and replays the same block range; a pass exits by itself once it reaches
 * the cutoff, and the head phase then runs until interrupted. The number of
 * passes comes from assets/pools.json, so this stays correct when the cutoff is
 * moved and the manifest is regenerated.
 */
import {spawn} from 'child_process'
import {manifest, phaseNames} from '../processor'

function runPhase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--require=dotenv/config', 'lib/main.js', name], {
            stdio: 'inherit',
            env: process.env,
        })
        child.on('error', reject)
        child.on('exit', (code, signal) => {
            if (signal) return reject(new Error(`${name} was killed by ${signal}`))
            if (code !== 0) return reject(new Error(`${name} exited with code ${code}`))
            resolve()
        })
    })
}

async function main(): Promise<void> {
    const phases = phaseNames()
    console.log(`indexing in ${phases.length} phases up to cutoff ${manifest.height}: ${phases.join(', ')}`)

    for (const phase of phases) {
        console.log(`\n=== ${phase} ===`)
        await runPhase(phase)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
